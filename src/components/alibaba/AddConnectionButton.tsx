import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { useStartOAuth } from '@/integrations/alibaba/hooks/use-alibaba-connections';
import type { AlibabaPlatform } from '@/integrations/alibaba/types';

interface AddConnectionButtonProps {
  platform?: AlibabaPlatform;
}

/**
 * Button that initiates the Alibaba OAuth flow.
 * Shows a loading spinner while waiting for the redirect URL,
 * then performs a full-page redirect to Alibaba's authorization page.
 */
export const AddConnectionButton = ({ platform = 'alibaba_com' }: AddConnectionButtonProps) => {
  const { mutate: startOAuth, isPending } = useStartOAuth();

  const handleClick = () => {
    startOAuth({ platform });
  };

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Plus className="mr-2 h-4 w-4" />
          Connect Alibaba Shop
        </>
      )}
    </Button>
  );
};
