import type { Node } from "@xyflow/react";
import type { DatatableColumn } from "src/common/types";

export type TableNodeData = {
  label: string;
  columns: DatatableColumn[];
  onClick: () => void;
  onEditProperties: () => void;
};

export type TableNode = Node<TableNodeData>;
export type FlowNode = TableNode;
