/** Schema-driven form (react-hook-form). Prefer this name over layout `Form`. */
export { Form as SchemaForm } from "./Form";
export type { FormProps as SchemaFormProps } from "./Form";
/** @deprecated use SchemaForm — kept so existing demo imports keep typechecking during migrate */
export { Form as FormSchema } from "./Form";
export { FormItem } from "./FormItem";
export type { FormItemProps } from "./FormItem";
export { EFormItemType } from "./common/enum";
export { hydrateRules, fieldNameOf, isRuleRequired } from "./common/rules";
export type { FormFetcher } from "./common/context";
export type {
  TForm,
  TFormItemProps,
  TFormRule,
  TRuleValueMessage,
  ISelectItemProps,
  IFormItemHelpProps,
  TFormItemInput,
  TFormItemTextarea,
  TFormItemNumber,
  TFormItemSelect,
  TFormItemSelectMultiple,
  TFormItemSelectRemote,
  TFormItemDateTime,
  TFormItemTime,
  TFormItemRepeater,
  TFormItemObject,
  TFormItemRadio,
  TFormItemColor,
  TFormItemHidden,
  TFormItemSwitch,
  TFormItemCheckbox,
  TFormItemCustom,
  TFormItemRenderCtx,
} from "./common/types";
