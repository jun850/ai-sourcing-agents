import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Menu, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { EditOutlined, Logout, PhotoCamera } from "@mui/icons-material";
import { getSession, getWorkspaceProfile, signOut, updateWorkspaceProfile, uploadWorkspaceAvatar, type WorkspaceProfile } from "./supabase";

function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "A"; }

export function ProfileMenu({ profile, onProfileChange, triggerLabel = "Open profile menu", editOpen, onEditOpenChange }: { profile: WorkspaceProfile; onProfileChange: (profile: WorkspaceProfile) => void; triggerLabel?: string; editOpen?: boolean; onEditOpenChange?: (open: boolean) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [internalEditing, setInternalEditing] = useState(false);
  const editing = editOpen ?? internalEditing;
  const setEditing = onEditOpenChange ?? setInternalEditing;
  const [name, setName] = useState(profile.full_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(profile.full_name); setAvatarUrl(profile.avatar_url); }, [profile]);
  async function chooseAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try { const session = await getSession(); if (!session) throw new Error("Sign in to change your avatar."); setAvatarUrl(await uploadWorkspaceAvatar(session.user.id, file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We could not upload that image."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try { const next = await updateWorkspaceProfile({ fullName: name, avatarUrl }); onProfileChange(next); setEditing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We could not save your profile."); }
    finally { setBusy(false); }
  }
  return <>
    <IconButton aria-label={triggerLabel} aria-controls={anchor ? "profile-menu" : undefined} aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)} sx={{ p: 0 }}>
      <Avatar src={profile.avatar_url || undefined} slotProps={{ img: { alt: "" } }} sx={{ width: 34, height: 34, bgcolor: "#e5e7eb", color: "#5d6672", fontSize: 13 }}>{initials(profile.full_name)}</Avatar>
    </IconButton>
    <Menu id="profile-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ list: { "aria-label": "Profile menu" } }} transformOrigin={{ horizontal: "right", vertical: "top" }} anchorOrigin={{ horizontal: "right", vertical: "bottom" }}>
      <Box sx={{ px: 2, py: 1.25, minWidth: 240 }}><Typography sx={{ fontSize: 14, fontWeight: 800 }}>{profile.full_name}</Typography><Typography noWrap sx={{ mt: .25, color: "#667384", fontSize: 12 }}>{profile.email}</Typography></Box>
      <Divider />
      <MenuItem onClick={() => { setAnchor(null); setEditing(true); }}><EditOutlined fontSize="small" sx={{ mr: 1.25 }} />Edit profile</MenuItem>
      <MenuItem onClick={() => void signOut().then(() => location.assign("/sign-in")).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not sign out."))}><Logout fontSize="small" sx={{ mr: 1.25 }} />Sign out</MenuItem>
    </Menu>
    <Dialog open={editing} onClose={() => !busy && setEditing(false)} fullWidth maxWidth="xs" aria-labelledby="edit-profile-title">
      <DialogTitle id="edit-profile-title">Edit profile</DialogTitle>
      <DialogContent><Stack spacing={2.25} sx={{ pt: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><Avatar src={avatarUrl || undefined} sx={{ width: 64, height: 64, bgcolor: "#e5e7eb", color: "#5d6672" }}>{initials(name)}</Avatar><Box><Button component="label" startIcon={<PhotoCamera />} disabled={busy}>Change avatar<input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} /></Button><Typography sx={{ mt: .25, color: "#667384", fontSize: 12 }}>JPG, PNG, or WebP · up to 5 MB</Typography></Box></Stack>
        <TextField label="Personal name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" slotProps={{ htmlInput: { maxLength: 160 } }} required fullWidth disabled={busy} />
        {error && <Typography role="alert" sx={{ color: "#b42318", fontSize: 13 }}>{error}</Typography>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setEditing(false)} disabled={busy}>Cancel</Button><Button variant="contained" onClick={() => void save()} disabled={busy || !name.trim()} aria-busy={busy}>Save changes</Button></DialogActions>
    </Dialog>
  </>;
}
