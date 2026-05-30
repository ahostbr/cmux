export interface ArgDef {
  name: string;
  label: string;
  type: "string" | "int" | "choice";
  required: boolean;
  default: string | number | null;
  choices: string[] | null;
}

export interface ActionDef {
  id: string;
  name: string;
  category: string;
  method: "shortcut" | "cli" | "palette";
  shortcut: string | null;
  palette_name: string | null;
  args: ArgDef[];
  changes_structure: boolean;
  description: string;
}

export interface ExecuteRequest {
  action_id: string;
  window: number;
  pane_id: number | null;
  args?: Record<string, string | number>;
}

export interface ExecuteResponse {
  ok: boolean;
  error?: string;
  action?: string;
  changes_structure?: boolean;
}

export interface ActionsResponse {
  actions: ActionDef[];
  total: number;
}

export interface CategoriesResponse {
  categories: Record<string, number>;
}
