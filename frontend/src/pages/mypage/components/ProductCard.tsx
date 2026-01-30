import React from "react";
import sidedishImg from "@/assets/products/sidedish.jpg";


type Product = {
  id: string | number;
  name?: string;
  price?: number;
  imageUrl?: string;
  image?: string;
};

type Props = {
  product: Product;
  onBuy?: () => void;
};

const KRW = (n?: number) => (n ? n.toLocaleString("ko-KR") + "원" : "");

const ProductCard: React.FC<Props> = ({ product, onBuy }) => {
  const imgSrc = product.imageUrl || product.image || sidedishImg;

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-4">
      <img
        src={imgSrc}
        alt={product.name}
        className="w-20 h-20 object-cover rounded-lg"
      />

      <div className="flex-1">
        <div className="font-semibold text-sm text-slate-900 dark:text-white">{product.name}</div>
        <div className="text-xs text-slate-500 mt-1">{KRW(product.price)}</div>
      </div>

      <div className="flex items-center">
        <button
          onClick={onBuy}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm"
        >
          구매
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
