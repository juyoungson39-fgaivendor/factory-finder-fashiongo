import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Unplug } from 'lucide-react';
import { useDisconnectShop } from '@/integrations/alibaba/hooks/use-alibaba-connections';

interface DisconnectConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  shopName: string;
}

/**
 * Confirmation dialog before disconnecting an Alibaba shop.
 * Warns the user that all synced data will be removed.
 */
export const DisconnectConfirmDialog = ({
  open,
  onOpenChange,
  connectionId,
  shopName,
}: DisconnectConfirmDialogProps) => {
  const { mutate: disconnect, isPending } = useDisconnectShop();

  const handleConfirm = () => {
    disconnect(connectionId, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect shop</DialogTitle>
          <DialogDescription>
            Are you sure you want to disconnect{' '}
            <span className="font-semibold text-foreground">{shopName}</span>?
            <br />
            <br />
            This will remove the connection and all synced products, orders, and inventory
            data associated with this shop. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Unplug className="h-4 w-4 mr-2" />
            )}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
