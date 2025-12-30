export { getEmbeddings, embedText, embedTexts } from "./embeddings.js";

export {
  addDocuments,
  search,
  multiSearch,
  clearTable,
  countDocuments,
  VectorStoreError,
  type SourceType,
  type DocumentChunk,
  type StoredDocument,
  type SearchResult,
} from "./vectorStore.js";
