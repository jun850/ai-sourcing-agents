import { createTheme } from "@mui/material/styles";

export const atelixMaterialTheme = createTheme({
  palette: {
    primary: { main: "#1d5a3c", contrastText: "#ffffff" },
    secondary: { main: "#526176" },
    error: { main: "#ad4139" },
    success: { main: "#244e35" },
    background: { default: "#f4f7f3", paper: "#ffffff" },
    text: { primary: "#121714", secondary: "#536059" },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: "'DM Sans', Arial, sans-serif", button: { fontWeight: 700, textTransform: "none" } },
  components: {
    MuiOutlinedInput: { styleOverrides: { root: { minHeight: 52, borderRadius: 10, backgroundColor: "#ffffff" } } },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiButton: { styleOverrides: { root: { minHeight: 52, borderRadius: 999 } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0, minHeight: "1.25em" } } },
  },
});
