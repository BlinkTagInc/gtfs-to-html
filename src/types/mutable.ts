/** Remove the readonly modifier used by node-gtfs query result rows. */
export type Mutable<T> = {
  -readonly [Property in keyof T]: T[Property];
};
