import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/Logo';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: '로그인 실패', description: error.message, variant: 'destructive' });
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: '가입 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '가입 완료', description: '이메일을 확인해주세요.' });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground">
          <h2 className="text-3xl font-light leading-tight mb-6">
            Wholesale marketplace<br />
            <span className="font-bold">YOU CAN RELY ON</span>
          </h2>
          <p className="text-primary-foreground/60 text-sm leading-relaxed">
            공장 소싱부터 스코어링, FashionGo 자동 상품 등록까지.
            AI가 당신의 벤더 비즈니스를 한 단계 끌어올립니다.
          </p>
          <div className="mt-12 pt-8 border-t border-primary-foreground/10">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-2xl font-bold">AI</div>
                <div className="text-xs text-primary-foreground/50 mt-1">자동 스크래핑</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Score</div>
                <div className="text-xs text-primary-foreground/50 mt-1">공장 평가</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Auto</div>
                <div className="text-xs text-primary-foreground/50 mt-1">상품 등록</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <Logo size="lg" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary">
              <TabsTrigger value="signin" className="text-xs uppercase tracking-widest">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs uppercase tracking-widest">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">이메일</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">비밀번호</Label>
                  <div className="relative">
                    <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 uppercase tracking-widest text-xs font-semibold" disabled={loading}>
                  {loading ? '로그인 중...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">이름</Label>
                  <Input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">이메일</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">비밀번호</Label>
                  <div className="relative">
                    <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-11 pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 uppercase tracking-widest text-xs font-semibold" disabled={loading}>
                  {loading ? '가입 중...' : 'Register'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Auth;
