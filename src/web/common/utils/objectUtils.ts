import { isEqual } from "lodash";

export const cleanObject = <T extends Record<string, any>>(obj: T): Partial<T> => {
  return Object.fromEntries(Object.entries(obj).filter(([_, value]) => value !== "" && value !== null && value !== undefined)) as Partial<T>;
};

export function getUpdatedDiff(originalObj: any, updatedObj: any): any {
  const diff = Object.keys(updatedObj).reduce<Record<string, any>>((diffInfo, key) => {
    if (isEqual(originalObj[key], updatedObj[key])) {
      return diffInfo;
    }

    diffInfo[key] = updatedObj[key];
    return diffInfo;
  }, {});

  return diff;
}

/**
 * Gets a nested value from an object using a dot-notation path
 * @param obj The object to traverse
 * @param path The path in dot notation (e.g. "user.address.city")
 * @returns The value at the path or undefined if the path doesn't exist
 */
export const getValueByPath = (obj: any, path: string): any => {
  return path.split(".").reduce((current, key) => current?.[key], obj);
};
