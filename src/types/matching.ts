export interface SourcingProduct {
  id: string;
  name: string;
  name_cn: string;
  price_range: string;
  moq: number;
  supplier: string;
  supplier_rating: number;
  category: string;
  image: string;
  tags: string[];
}

export interface AIMatchedProduct extends SourcingProduct {
  similarity: number;
  matchedByAI: boolean;
}
