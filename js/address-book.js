/* Shared saved-address experience for account and checkout surfaces. */
(function(){
'use strict';

const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const addressLine=address=>[address.line1,address.line2,address.city,address.province,address.postal_code,address.country].filter(Boolean).join(', ');

function createAddressBook({api,list,addButton,searchInput=null,toast=()=>{},selectable=false,selectedId=null,onSelect=()=>{},countries=[]}){
  if(!api||!list||!addButton) throw new Error('Address book requires an API, list, and add button.');
  let addresses=[];
  let currentSelected=selectedId;
  let returnFocus=null;
  const countryListId=`address-countries-${Math.random().toString(36).slice(2)}`;
  const dialog=document.createElement('dialog');
  dialog.className='address-dialog';
  dialog.setAttribute('aria-labelledby',`${countryListId}-title`);
  dialog.innerHTML=`
    <form method="dialog" class="address-dialog-shell" data-address-editor novalidate>
      <header class="address-dialog-head">
        <button class="address-dialog-back" type="button" data-address-close aria-label="Close address editor">←</button>
        <div><h2 id="${countryListId}-title">Add address</h2><p>Use the delivery details your supplier should receive.</p></div>
        <button class="address-dialog-close" type="button" data-address-close aria-label="Close address editor">×</button>
      </header>
      <div class="address-dialog-body">
        <input type="hidden" name="id">
        <div class="address-form-grid">
          <label class="field-lg"><span>Address label <small>Optional</small></span><input name="label" maxlength="50" placeholder="Warehouse or office"></label>
          <label class="field-lg"><span>Recipient name</span><input name="recipient_name" maxlength="100" autocomplete="name" required></label>
          <label class="field-lg"><span>Phone number <small>Optional</small></span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
          <label class="field-lg address-form-full"><span>Address line 1</span><input name="line1" maxlength="180" autocomplete="address-line1" placeholder="Street, building, unit" required></label>
          <label class="field-lg address-form-full"><span>Address line 2 <small>Optional</small></span><input name="line2" maxlength="180" autocomplete="address-line2"></label>
          <label class="field-lg"><span>City</span><input name="city" maxlength="100" autocomplete="address-level2" required></label>
          <label class="field-lg"><span>Province or state <small>Optional</small></span><input name="province" maxlength="100" autocomplete="address-level1"></label>
          <label class="field-lg"><span>Postal code <small>Optional</small></span><input name="postal_code" maxlength="24" autocomplete="postal-code"></label>
          <label class="field-lg"><span>Country</span><input name="country" maxlength="100" autocomplete="country-name" list="${countryListId}" required></label>
        </div>
        <datalist id="${countryListId}">${countries.map(country=>`<option value="${esc(country.country_name||country.country_code||country)}"></option>`).join('')}</datalist>
        <label class="address-default"><input type="checkbox" name="is_default"> Make this my default delivery address</label>
        <p class="address-form-error" role="alert" data-address-error hidden></p>
      </div>
      <footer class="address-dialog-foot">
        <button class="btn btn-out" type="button" data-address-close>Cancel</button>
        <button class="btn btn-green" type="submit" data-address-save>Save address</button>
      </footer>
    </form>`;
  document.body.appendChild(dialog);
  const confirmDialog=document.createElement('dialog');
  confirmDialog.className='address-confirm';
  confirmDialog.innerHTML=`<div class="address-confirm-body"><h2>Delete address?</h2><p data-address-confirm-copy></p></div><div class="address-confirm-actions"><button class="btn btn-out" type="button" data-address-confirm-cancel>Cancel</button><button class="btn btn-out address-confirm-delete" type="button" data-address-confirm-delete>Delete address</button></div>`;
  document.body.appendChild(confirmDialog);
  const form=dialog.querySelector('[data-address-editor]');
  const title=dialog.querySelector('h2');
  const errorBox=dialog.querySelector('[data-address-error]');

  function showError(message){
    errorBox.textContent=message||'The address could not be saved.';
    errorBox.hidden=false;
  }

  function render(){
    const query=(searchInput?.value||'').trim().toLowerCase();
    const visible=addresses.filter(address=>!query||[address.label,address.recipient_name,address.phone,address.line1,address.line2,address.city,address.province,address.postal_code,address.country].some(value=>String(value||'').toLowerCase().includes(query)));
    if(!addresses.length){
      list.innerHTML='<div class="address-empty"><strong>No saved addresses</strong><p>Add a delivery address to continue to checkout faster.</p></div>';
      return;
    }
    if(!visible.length){
      list.innerHTML='<div class="address-empty"><strong>No matching addresses</strong><p>Try a different name, city, or country.</p></div>';
      return;
    }
    list.innerHTML=visible.map(address=>{
      const selected=selectable&&String(address.id)===String(currentSelected);
      return `<article class="address-card${selected?' is-selected':''}" data-address-id="${esc(address.id)}">
        <div class="address-card-main">
          <div class="address-card-title"><strong>${esc(address.label||'Delivery address')}</strong>${address.is_default?'<span class="address-badge">Default</span>':''}${selected?'<span class="address-badge address-badge-selected">Selected</span>':''}</div>
          <p><b>${esc(address.recipient_name)}</b>${address.phone?` · ${esc(address.phone)}`:''}</p>
          <p>${esc(addressLine(address))}</p>
        </div>
        <div class="address-card-actions">
          ${selectable&&!selected?`<button class="btn btn-green" type="button" data-address-select="${esc(address.id)}">Use this address</button>`:''}
          ${!address.is_default?`<button class="btn btn-out" type="button" data-address-default="${esc(address.id)}">Set default</button>`:''}
          <button class="btn btn-out" type="button" data-address-edit="${esc(address.id)}">Edit</button>
          <button class="address-delete" type="button" data-address-delete="${esc(address.id)}">Delete</button>
        </div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-address-select]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.addressSelect)));
    list.querySelectorAll('[data-address-default]').forEach(button=>button.addEventListener('click',()=>setDefault(button.dataset.addressDefault,button)));
    list.querySelectorAll('[data-address-edit]').forEach(button=>button.addEventListener('click',()=>openForm(addresses.find(address=>String(address.id)===button.dataset.addressEdit),button)));
    list.querySelectorAll('[data-address-delete]').forEach(button=>button.addEventListener('click',()=>remove(button.dataset.addressDelete,button)));
  }

  function getSelected(){
    return addresses.find(address=>String(address.id)===String(currentSelected))||null;
  }

  async function load({preserveSelection=true}={}){
    list.setAttribute('aria-busy','true');
    const loaded=await api.getAddresses();
    addresses=Array.isArray(loaded)?loaded:[];
    if(!preserveSelection||!addresses.some(address=>String(address.id)===String(currentSelected))){
      currentSelected=(addresses.find(address=>address.is_default)||addresses[0]||{}).id||null;
    }
    list.removeAttribute('aria-busy');
    render();
    const selected=getSelected();
    if(selectable) onSelect(selected);
    return addresses;
  }

  function select(id){
    currentSelected=id;
    render();
    onSelect(getSelected());
  }

  async function setDefault(id,button){
    button.disabled=true;
    const {error}=await api.setDefaultAddress(id);
    if(error){button.disabled=false;toast(error.message||'Could not update the default address');return;}
    toast('Default address updated');
    await load();
  }

  async function remove(id,button){
    const address=addresses.find(item=>String(item.id)===String(id));
    if(!address) return;
    const confirmed=await confirmRemove(address,button);
    if(!confirmed) return;
    button.disabled=true;
    const {error}=await api.deleteAddress(id);
    if(error){button.disabled=false;toast(error.message||'Could not delete the address');return;}
    toast('Address deleted');
    await load();
  }

  function confirmRemove(address,trigger){
    confirmDialog.querySelector('[data-address-confirm-copy]').textContent=`${address.label||'This address'} will be removed from your account. This cannot be undone.`;
    confirmDialog.showModal();
    confirmDialog.querySelector('[data-address-confirm-cancel]').focus();
    return new Promise(resolve=>{
      const cancel=confirmDialog.querySelector('[data-address-confirm-cancel]'),confirm=confirmDialog.querySelector('[data-address-confirm-delete]');
      const finish=value=>{cancel.onclick=null;confirm.onclick=null;confirmDialog.close();trigger?.focus();resolve(value);};
      cancel.onclick=()=>finish(false);confirm.onclick=()=>finish(true);
      confirmDialog.oncancel=event=>{event.preventDefault();finish(false);};
    });
  }

  function openForm(address=null,trigger=addButton){
    returnFocus=trigger instanceof HTMLElement?trigger:document.activeElement;
    form.reset();
    errorBox.hidden=true;
    const fields=form.elements;
    fields.id.value=address?.id||'';
    ['label','recipient_name','phone','line1','line2','city','province','postal_code','country'].forEach(name=>{fields[name].value=address?.[name]||'';});
    fields.is_default.checked=!!address?.is_default||!addresses.length;
    title.textContent=address?'Edit address':'Add address';
    dialog.showModal();
    fields.recipient_name.focus();
  }

  function close(){ if(dialog.open) dialog.close(); }
  dialog.querySelectorAll('[data-address-close]').forEach(button=>button.addEventListener('click',close));
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    errorBox.hidden=true;
    if(!form.reportValidity()) return;
    const fields=form.elements;
    const id=fields.id.value;
    const makeDefault=fields.is_default.checked;
    const payload={
      label:fields.label.value.trim()||null,
      recipient_name:fields.recipient_name.value.trim(),
      phone:fields.phone.value.trim()||null,
      line1:fields.line1.value.trim(),
      line2:fields.line2.value.trim()||null,
      city:fields.city.value.trim(),
      province:fields.province.value.trim()||null,
      postal_code:fields.postal_code.value.trim()||null,
      country:fields.country.value.trim()
    };
    const save=form.querySelector('[data-address-save]');
    const original=save.textContent;
    save.disabled=true;save.textContent='Saving…';
    const result=id?await api.updateAddress(id,payload):await api.createAddress(payload);
    if(result?.error){showError(result.error.message);save.disabled=false;save.textContent=original;return;}
    const savedId=id||result.address?.id;
    if(makeDefault&&savedId){
      const defaultResult=await api.setDefaultAddress(savedId);
      if(defaultResult?.error){showError(defaultResult.error.message);save.disabled=false;save.textContent=original;return;}
    }
    if(selectable&&savedId) currentSelected=savedId;
    save.disabled=false;save.textContent=original;
    close();
    toast(id?'Address updated':'Address added');
    await load();
  });
  addButton.addEventListener('click',()=>openForm());
  searchInput?.addEventListener('input',render);

  return {
    load,
    render,
    openForm,
    getSelected,
    setSelected:id=>select(id),
    getAddresses:()=>addresses.slice(),
    destroy:()=>{dialog.remove();confirmDialog.remove();}
  };
}

window.ATELIX_formatAddress=addressLine;
window.ATELIX_createAddressBook=createAddressBook;
})();
