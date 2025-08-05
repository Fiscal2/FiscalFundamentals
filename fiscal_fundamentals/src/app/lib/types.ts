export type Card = {
  handle: string;
  title: string;
  featuredImage: {
    url: string;
  };
  priceRange: {
    maxVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
};

export type StockItem = {
  ticker: string;
  companyName: string;
};

export type MenuItem = {
  title: string;
  path: string;
};