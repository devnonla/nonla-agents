import type { NodeTypes } from "@xyflow/react";
import { TableNodeComponent } from "./TableNode";

export type { FlowNode, TableNode, TableNodeData } from "./types";

export const schemaNodeTypes: NodeTypes = {
  table: TableNodeComponent,
};
