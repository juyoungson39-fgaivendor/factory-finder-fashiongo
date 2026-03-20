import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/Logo';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const REMEMBER_KEY = 'fg_remember_email';
const AUTO_LOGIN_KEY = 'fg_auto_login';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const { toast } = useToast();

  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
    const autoLoginData = localStorage.getItem(AUTO_LOGIN_KEY);
    if (autoLoginData) {
      setAutoLogin(true);
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Save/clear remember email
    if (rememberEmail) {
      localStorage.setItem(REMEMBER_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    // Save/clear auto login preference
    if (autoLogin) {
      localStorage.setItem(AUTO_LOGIN_KEY, 'true');
    } else {
      localStorage.removeItem(AUTO_LOGIN_KEY);
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: '로그인 실패', description: error.message, variant: 'destructive' });
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin }
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
          <h2 className="text-3xl font-light leading-tight mb-2">
            <span className="font-bold">FG AI VENDOR agent</span>
          </h2>
          <p className="text-primary-foreground/80 text-sm font-medium mb-6">
            Vendor의 AI화를 실현하는 AI 에이전트
          </p>
          <p className="text-primary-foreground/60 text-sm leading-relaxed mb-3">데이터 축적 → 공장 검증 → FashionGo 분석 기반 AI 매칭 → 실시간 상품 업데이트까지, 벤더 운영 전 과정을 AI vendor agent가 24/7 일합니다.


          </p>
          <div className="mt-12 pt-8 border-t border-primary-foreground/10">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">Data</div>
                <div className="text-xs text-primary-foreground/50 mt-1">데이터 축적</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Verify</div>
                <div className="text-xs text-primary-foreground/50 mt-1">공장 검증</div>
              </div>
              <div>
                <div className="text-2xl font-bold">AI</div>
                <div className="text-xs text-primary-foreground/50 mt-1">트렌드 매칭</div>
              </div>
              <div>
                <div className="text-2xl font-bold">Live</div>
                <div className="text-xs text-primary-foreground/50 mt-1">실시간 등록</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
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
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
                  
                  비밀번호를 잊으셨나요?
                </button>
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

          {forgotMode &&
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm shadow-lg">
                <h3 className="text-sm font-semibold mb-4">비밀번호 재설정</h3>
                <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLoading(true);
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`
                  });
                  if (error) {
                    toast({ title: '오류', description: error.message, variant: 'destructive' });
                  } else {
                    toast({ title: '이메일 전송 완료', description: '비밀번호 재설정 링크를 확인해주세요.' });
                    setForgotMode(false);
                  }
                  setLoading(false);
                }}
                className="space-y-4">
                
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">이메일</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1 h-11 text-xs" onClick={() => setForgotMode(false)}>취소</Button>
                    <Button type="submit" className="flex-1 h-11 text-xs uppercase tracking-widest font-semibold" disabled={loading}>
                      {loading ? '전송 중...' : '재설정 링크 전송'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

};

export default Auth;