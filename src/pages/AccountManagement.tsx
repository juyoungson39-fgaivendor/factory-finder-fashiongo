import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Shield, Users, Crown } from 'lucide-react';

const MASTER_EMAIL = 'fgaivendor@nhn.com';

type UserWithRole = {
  user_id: string;
  display_name: string | null;
  role: 'admin' | 'user' | 'viewer' | null;
};

const AccountManagement = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  const isDev = import.meta.env.DEV;
  const canAccess = isAdmin || isDev;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, display_name');
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rErr) throw rErr;

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) ?? []);

      return (profiles ?? []).map(p => ({
        user_id: p.user_id,
        display_name: p.display_name,
        role: roleMap.get(p.user_id) ?? null,
      })) as UserWithRole[];
    },
    enabled: isAdmin,
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'user' | 'viewer' }) => {
      // Delete existing role
      await supabase.from('user_roles').delete().eq('user_id', userId);
      // Insert new role
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: '역할이 변경되었습니다.' });
    },
    onError: (err: any) => {
      toast({ title: '역할 변경 실패', description: err.message, variant: 'destructive' });
    },
  });

  const removeRole = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: '역할이 제거되었습니다.' });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        관리자 권한이 필요합니다.
      </div>
    );
  }

  const masterUser = users.find(u => u.display_name === MASTER_EMAIL || u.display_name?.includes('fgaivendor'));

  return (
    <div className="space-y-6">
      {/* Master account info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown size={16} className="text-amber-500" />
            마스터 계정
          </CardTitle>
          <CardDescription>시스템 최고 관리자 계정</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              Admin
            </Badge>
            <span className="text-sm font-medium">{MASTER_EMAIL}</span>
          </div>
        </CardContent>
      </Card>

      {/* User list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={16} />
            사용자 역할 관리
          </CardTitle>
          <CardDescription>등록된 사용자의 역할을 변경할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">로딩 중...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>현재 역할</TableHead>
                  <TableHead className="w-[180px]">역할 변경</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => {
                  const isMaster = u.display_name === MASTER_EMAIL;
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          {u.display_name || u.user_id.slice(0, 8)}
                          {isMaster && <Crown size={12} className="text-amber-500" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                          {u.role ?? '없음'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!isMaster && (
                          <Select
                            value={u.role ?? ''}
                            onValueChange={(val) => updateRole.mutate({ userId: u.user_id, newRole: val as any })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="역할 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isMaster && u.role && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 text-destructive hover:text-destructive"
                            onClick={() => removeRole.mutate(u.user_id)}
                          >
                            제거
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountManagement;
