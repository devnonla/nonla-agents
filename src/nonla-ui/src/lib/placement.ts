export type PopperPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "leftTop"
  | "leftBottom"
  | "rightTop"
  | "rightBottom";

export type RadixSide = "top" | "bottom" | "left" | "right";
export type RadixAlign = "start" | "center" | "end";

export function placementToRadix(placement?: PopperPlacement): { side: RadixSide; align: RadixAlign } {
  switch (placement) {
    case "topLeft":
      return { side: "top", align: "start" };
    case "topRight":
      return { side: "top", align: "end" };
    case "bottomLeft":
      return { side: "bottom", align: "start" };
    case "bottomRight":
      return { side: "bottom", align: "end" };
    case "leftTop":
      return { side: "left", align: "start" };
    case "leftBottom":
      return { side: "left", align: "end" };
    case "rightTop":
      return { side: "right", align: "start" };
    case "rightBottom":
      return { side: "right", align: "end" };
    case "top":
    case "bottom":
    case "left":
    case "right":
      return { side: placement, align: "center" };
    default:
      return { side: "bottom", align: "center" };
  }
}
