import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAlibabaConnections } from '@/integrations/alibaba/hooks/use-alibaba-connections';
import { ConnectionList } from '@/components/alibaba/ConnectionList';
import { ProductDataTable } from '@/components/alibaba/ProductDataTable';
import { OrderDataTable } from '@/components/alibaba/OrderDataTable';
import { InventoryDataTable } from '@/components/alibaba/InventoryDataTable';

/**
 * Alibaba Settings page — manages connections and displays synced data.
 *
 * Layout:
 *   Tabs: Connections | Products | Orders | Inventory
 *   - Connections tab: ConnectionList (select a shop + add/disconnect)
 *   - Data tabs: disabled until a shop is selected; show data for selected shop
 *
 * Handles ?connected=true and ?error=<code> query params from the OAuth callback.
 */
const AlibabaSettings = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: connections, isLoading, refetch } = useAlibabaConnections();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Handle OAuth callback result via query params (runs once on mount)
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'true') {
      toast({
        title: 'Shop connected!',
        description: 'Your Alibaba shop has been connected successfully.',
      });
      refetch();
      setSearchParams({}, { replace: true });
    } else if (error) {
      const errorMessages: Record<string, string> = {
        missing_params: 'OAuth callback was missing required parameters.',
        invalid_state: 'OAuth state validation failed. Please try again.',
        vault_error: 'Failed to securely store credentials. Please try again.',
        db_error: 'Failed to save connection. Please try again.',
      };
      toast({
        title: 'Connection failed',
        description: errorMessages[error] ?? `An error occurred: ${error}`,
        variant: 'destructive',
      });
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasConnection = !!selectedConnectionId;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Alibaba Integration</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect your Alibaba shop and sync products, orders, and inventory.
        </p>
      </div>

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="products" disabled={!hasConnection}>
            Products
          </TabsTrigger>
          <TabsTrigger value="orders" disabled={!hasConnection}>
            Orders
          </TabsTrigger>
          <TabsTrigger value="inventory" disabled={!hasConnection}>
            Inventory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-4">
          <ConnectionList
            connections={connections ?? []}
            isLoading={isLoading}
            selectedConnectionId={selectedConnectionId}
            onSelect={setSelectedConnectionId}
          />
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <ProductDataTable connectionId={selectedConnectionId} />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <OrderDataTable connectionId={selectedConnectionId} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <InventoryDataTable connectionId={selectedConnectionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AlibabaSettings;
