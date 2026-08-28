import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Menu, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { EditOutlined, Logout, PhotoCamera } from "@mui/icons-material";
import { getSession, getWorkspaceProfile, signOut, updateWorkspaceProfile, uploadWorkspaceAvatar, type WorkspaceProfile } from "./supabase";

function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "A"; }

export function ProfileMenu({ profile, onProfileChange, triggerLabel = "Open profile menu", editOpen, onEditOpenChange, hideTrigger = false }: { profile: WorkspaceProfile; onProfileChange: (profile: WorkspaceProfile) => void; triggerLabel?: string; editOpen?: boolean; onEditOpenChange?: (open: boolean) => void; hideTrigger?: boolean }) {
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
    {!hideTrigger && <>
    <IconButton aria-label={triggerLabel} aria-controls={anchor ? "profile-menu" : undefined} aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)} sx={{ p: 0 }}>
      <Avatar src={profile.avatar_url || undefined} slotProps={{ img: { alt: "" } }} sx={{ width: 34, height: 34, bgcolor: "#e5e7eb", color: "#5d6672", fontSize: 13 }}>{initials(profile.full_name)}</Avatar>
    </IconButton>
    <Menu id="profile-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ list: { "aria-label": "Profile settings", sx: { p: .75 } }, paper: { sx: { mt: .75, width: 292, maxWidth: "calc(100vw - 24px)", borderRadius: 3.5, boxShadow: "0 14px 34px rgba(32,41,54,.16)", overflow: "hidden" } } }} transformOrigin={{ horizontal: "right", vertical: "top" }} anchorOrigin={{ horizontal: "right", vertical: "bottom" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 1.5 }}>
        <Avatar src={profile.avatar_url || undefined} slotProps={{ img: { alt: "" } }} sx={{ width: 42, height: 42, bgcolor: "#e5eee7", color: "#3f694c", fontSize: 14, fontWeight: 800 }}>{initials(profile.full_name)}</Avatar>
        <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.01em" }}>{profile.full_name}</Typography><Typography noWrap sx={{ mt: .2, color: "#667384", fontSize: 12 }}>{profile.email || "Private workspace"}</Typography></Box>
      </Box>
      <Divider sx={{ mx: 1.25 }} />
      <MenuItem onClick={() => { setAnchor(null); setEditing(true); }} sx={{ gap: 1.25, mt: .75, minHeight: 58, borderRadius: 2, alignItems: "center", "&:hover": { bgcolor: "#f1f6f2" }, "&.Mui-focusVisible": { bgcolor: "#e8f2eb", outline: "2px solid #4b7657", outlineOffset: -2 } }}>
        <Box sx={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 1.5, bgcolor: "#e8f2eb", color: "#3d704d", flexShrink: 0 }}><EditOutlined fontSize="small" /></Box>
        <Box><Typography sx={{ fontSize: 13, fontWeight: 800 }}>Profile settings</Typography><Typography sx={{ mt: .1, color: "#667384", fontSize: 11.5 }}>Name and profile photo</Typography></Box>
      </MenuItem>
      <MenuItem onClick={() => void signOut().then(() => location.assign("/sign-in")).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not sign out."))} sx={{ gap: 1.25, mt: .25, minHeight: 48, borderRadius: 2, color: "#9e3b36", "&:hover": { bgcolor: "#fff2f0" }, "&.Mui-focusVisible": { bgcolor: "#fff2f0", outline: "2px solid #a33b36", outlineOffset: -2 } }}>
        <Box sx={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 1.5, bgcolor: "#fff0ed", flexShrink: 0 }}><Logout fontSize="small" /></Box>
        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>Sign out</Typography>
      </MenuItem>
    </Menu>
    </>}
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
