import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, ShieldOff, Eye, EyeOff, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const AdminUsers = () => {
  const { user } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*');
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const grantRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast({ title: role === 'admin' ? '어드민 권한 부여 완료' : '열람 권한 부여 완료' });
    },
    onError: (err: any) => toast({ title: '오류', description: err.message, variant: 'destructive' }),
  });

  const revokeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role as any);
      if (error) throw error;
    },
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast({ title: role === 'admin' ? '어드민 권한 해제 완료' : '열람 권한 해제 완료' });
    },
    onError: (err: any) => toast({ title: '오류', description: err.message, variant: 'destructive' }),
  });

  if (adminLoading) return <div className="text-muted-foreground p-8">로딩 중...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const getUserRoles = (userId: string) => {
    return roles.filter(r => r.user_id === userId).map(r => r.role);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" />
          사용자 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">가입된 사용자 목록 및 역할을 관리합니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">전체 사용자 ({profiles.length}명)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">로딩 중...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => {
                  const userRoles = getUserRoles(profile.user_id);
                  const hasAdmin = userRoles.includes('admin');
                  const hasViewer = userRoles.includes('viewer');
                  const isSelf = profile.user_id === user?.id;

                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="font-medium">{profile.display_name || '이름 없음'}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(profile.created_at).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {hasAdmin && <Badge variant="default">Admin</Badge>}
                          {hasViewer && <Badge variant="outline" className="border-primary/30 text-primary">열람권한</Badge>}
                          {!hasAdmin && !hasViewer && <Badge variant="secondary">User</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">본인</span>
                        ) : (
                          <div className="flex gap-1.5 justify-end flex-wrap">
                            {hasAdmin ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revokeRole.mutate({ userId: profile.user_id, role: 'admin' })}
                                disabled={revokeRole.isPending}
                              >
                                <ShieldOff className="w-3.5 h-3.5 mr-1" />
                                어드민 해제
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => grantRole.mutate({ userId: profile.user_id, role: 'admin' })}
                                disabled={grantRole.isPending}
                              >
                                <Shield className="w-3.5 h-3.5 mr-1" />
                                어드민
                              </Button>
                            )}
                            {hasViewer ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revokeRole.mutate({ userId: profile.user_id, role: 'viewer' })}
                                disabled={revokeRole.isPending}
                              >
                                <EyeOff className="w-3.5 h-3.5 mr-1" />
                                열람 해제
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => grantRole.mutate({ userId: profile.user_id, role: 'viewer' })}
                                disabled={grantRole.isPending}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                열람권한
                              </Button>
                            )}
                          </div>
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

export default AdminUsers;
