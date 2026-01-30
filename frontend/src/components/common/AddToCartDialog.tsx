import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

type Props = {
  open: boolean;
  setOpen: (v: boolean) => void;
  selectedProduct?: any | null;
};

export default function AddToCartDialog({ open, setOpen, selectedProduct }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>장바구니에 담겼습니다</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          {selectedProduct ? (
            (() => {
              const name = selectedProduct.name ?? selectedProduct.title ?? selectedProduct.productName ?? "";
              const count = Number(selectedProduct.count ?? selectedProduct.quantity ?? 1) || 1;

              if (count > 1) {
                if (name) {
                  return (
                    <div className="text-sm text-muted-foreground">
                      {name} 외 {count - 1}개의 상품이 추가되었습니다. 장바구니로 이동하시겠습니까?
                    </div>
                  );
                }
                return (
                  <div className="text-sm text-muted-foreground">{count}개의 상품이 추가되었습니다. 장바구니로 이동하시겠습니까?</div>
                );
              }

              // single
              if (name) {
                return (
                  <div className="text-sm text-muted-foreground">{name}이(가) 장바구니에 추가되었습니다. 장바구니로 이동하시겠습니까?</div>
                );
              }

              return <div className="text-sm text-muted-foreground">장바구니로 이동하시겠습니까?</div>;
            })()
          ) : (
            <div className="text-sm text-muted-foreground">장바구니로 이동하시겠습니까?</div>
          )}
        </DialogDescription>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            아니요
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              navigate("/cart");
            }}
          >
            예
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
