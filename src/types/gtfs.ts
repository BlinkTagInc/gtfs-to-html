// Database source identity is carried by the reader, not template rows.
export type Row<T> = Omit<T, 'source_id'>;
