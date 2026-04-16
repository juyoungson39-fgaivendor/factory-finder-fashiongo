import { Loader2, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectionCard } from './ConnectionCard';
import { AddConnectionButton } from './AddConnectionButton';
import type { AlibabaConnection } from '@/integrations/alibaba/types';

interface ConnectionListProps {
  connections: AlibabaConnection[];
  isLoading: boolean;
  selectedConnectionId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Renders the full list of shop connections with an Add button.
 * Handles loading and empty states.
 * Clicking a card both selects it (for data view tabs) and highlights it.
 */
export const ConnectionList = ({
  connections,
  isLoading,
  selectedConnectionId,
  onSelect,
}: ConnectionListProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="items-center text-center pb-2">
          <div className="rounded-full bg-secondary p-3 mb-2">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">No shops connected</CardTitle>
          <CardDescription>
            Connect your Alibaba shop to start syncing data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <AddConnectionButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddConnectionButton />
      </div>
      <div className="space-y-4">
        {connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            isSelected={selectedConnectionId === connection.id}
            onSelect={() => onSelect(connection.id)}
          />
        ))}
      </div>
      {selectedConnectionId && (
        <p className="text-xs text-muted-foreground text-center">
          Click the Products, Orders, or Inventory tabs to view synced data for the selected shop.
        </p>
      )}
    </div>
  );
};
