import type { ModalProps, PopoverProps } from "antd";
import { type ThemeConfig, theme } from "antd";

/** Shared outlined-control edge — Input, Select, DatePicker, InputNumber. */
const CONTROL_BORDER = "rgba(102, 102, 102, 0.2)";
const CONTROL_BG = "#212121";
const CONTROL_BG_HOVER = "#2a2a2a";

const outlinedControl = {
  colorBgContainer: CONTROL_BG,
  hoverBorderColor: CONTROL_BORDER,
  activeBorderColor: CONTROL_BORDER,
} as const;

/** Dark-only Ant Design theme mapped to app palette. */
export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorBgBase: "#121212",
    colorBgContainer: "#191919",
    colorBgElevated: "#1e1e1e",
    colorBgLayout: "#121212",
    colorBgMask: "rgba(0, 0, 0, 0.68)",
    colorText: "#d4d4d4",
    colorTextSecondary: "#8a8a8a",
    colorTextTertiary: "#9a9a9a",
    colorTextQuaternary: "#6e6e6e",
    colorPrimary: "#dd7627",
    colorPrimaryHover: "#ffa333",
    colorError: "#ef4444",
    colorSuccess: "#0ac864",
    green: "#0ac864",
    colorWarning: "#f1b467",
    colorInfo: "#599ce7",
    colorBorder: CONTROL_BORDER,
    colorBorderDisabled: CONTROL_BORDER,
    colorBorderSecondary: "rgba(102, 102, 102, 0.12)",
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    fontFamily: '"Inter var", system-ui',
    fontFamilyCode: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 14,
    controlHeight: 32,
    controlHeightSM: 28,
    controlHeightLG: 36,
    // No focus rings — DESIGN.md. Ant Design 6 paints a 3px colorPrimaryBorder
    // outline on Modal/Drawer/Switch/etc via :focus-visible (lineWidthFocus).
    lineWidthFocus: 0,
    controlOutlineWidth: 0,
    controlOutline: "transparent",
    // Keep base surfaces flat; elevated overlays (dropdown/popover) need depth
    // so they separate from content underneath (e.g. datatable select cells).
    boxShadow: "none",
    boxShadowSecondary: "0 0 0 1px rgba(102, 102, 102, 0.32), 0 8px 24px rgba(0, 0, 0, 0.45)",
    boxShadowTertiary: "0 0 0 1px rgba(102, 102, 102, 0.24), 0 4px 12px rgba(0, 0, 0, 0.35)",
    // Ant Design 6 applies this as CSS `filter` on Popover/Tooltip root.
    // Non-none values tint colored borders (e.g. flow tool popovers) — keep off;
    // depth comes from container boxShadow / component styles instead.
    dropShadowPopover: "none",
  } as ThemeConfig["token"],
  components: {
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
      // Filled default chip (same 28px / 10px pad as primary) so Popconfirm
      // Keep isn't a sunken outline next to solid Remove.
      paddingInlineSM: 10,
      paddingInline: 14,
      defaultBg: CONTROL_BG,
      defaultBorderColor: CONTROL_BG,
      defaultHoverBg: CONTROL_BG_HOVER,
      defaultHoverColor: "#d4d4d4",
      defaultHoverBorderColor: CONTROL_BG_HOVER,
      defaultActiveBg: CONTROL_BG_HOVER,
      defaultActiveColor: "#d4d4d4",
      defaultActiveBorderColor: CONTROL_BG_HOVER,
    },
    Dropdown: {
      paddingBlock: 4,
    },
    Segmented: {
      // colorBgLayout matches page bg — track would be invisible without override.
      trackBg: "#2a2a2a",
      itemSelectedBg: "#3d3d3d",
      trackPadding: 4,
    },
    Modal: {
      contentBg: "#191919",
      headerBg: "#161616",
      footerBg: "#161616",
      titleFontSize: 15,
      contentPadding: 0,
      // Form modals: section paddings. Confirm: its own body padding (not contentPadding).
      bodyPadding: "20px 16px",
      confirmBodyPadding: "24px 24px 20px",
      confirmBtnsMarginTop: 20,
      headerPadding: "12px 16px",
      headerBorderBottom: "1px solid rgba(102, 102, 102, 0.2)",
      headerMarginBottom: 0,
      footerPadding: "12px 16px",
      footerBorderTop: "1px solid rgba(102, 102, 102, 0.2)",
      footerMarginTop: 0,
      footerBorderRadius: "0 0 12px 12px",
    } as NonNullable<ThemeConfig["components"]>["Modal"],
    Input: {
      // Slightly lighter than modal/card (#191919) so fields read as controls.
      ...outlinedControl,
      hoverBg: CONTROL_BG_HOVER,
      activeBg: CONTROL_BG_HOVER,
      // Hover/focus: keep default border, lift background instead, no ring.
      activeShadow: "none",
      errorActiveShadow: "none",
      warningActiveShadow: "none",
    },
    InputNumber: {
      ...outlinedControl,
      hoverBg: CONTROL_BG_HOVER,
      activeBg: CONTROL_BG_HOVER,
      activeShadow: "none",
    },
    Select: {
      ...outlinedControl,
      activeOutlineColor: "transparent",
      optionSelectedBg: "color-mix(in oklab, #dd7627 14%, transparent)",
    },
    DatePicker: {
      ...outlinedControl,
      hoverBg: CONTROL_BG_HOVER,
      activeBg: CONTROL_BG_HOVER,
      activeShadow: "none",
    },
    Cascader: {
      ...outlinedControl,
      optionSelectedBg: "color-mix(in oklab, #dd7627 14%, transparent)",
    },
  },
};

/** Default Popover edge — real border/box-shadow, not CSS `filter` (dropShadowPopover). */
export const antdPopoverConfig: Pick<PopoverProps, "styles"> = {
  styles: {
    container: {
      border: "1px solid rgba(102, 102, 102, 0.32)",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
    },
  },
};

export const antdModalConfig: Pick<ModalProps, "mask" | "styles"> = {
  mask: { blur: true },
  styles: {
    container: {
      padding: 0,
      border: "1px solid rgba(102, 102, 102, 0.32)",
      boxShadow: "0 16px 48px rgba(0, 0, 0, 0.55)",
    },
    header: {
      // Do not set `display` — Modal.confirm hides the header via CSS; inline
      // display would show a duplicate title.
      padding: "12px 16px",
      margin: 0,
      minHeight: 44,
    },
    // Do not set body padding here — ConfigProvider maps `styles.body` onto
    // Modal.confirm's inner content node and throws the layout off-balance.
    // Form modal body padding comes from the Modal `bodyPadding` token instead.
    footer: {
      padding: "12px 16px",
      margin: 0,
      background: "#161616",
    },
    close: {
      top: 8,
      insetInlineEnd: 10,
    },
  },
};
