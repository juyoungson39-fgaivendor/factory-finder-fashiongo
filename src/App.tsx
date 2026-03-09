import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import AddFactory from "./pages/AddFactory";
import FactoryDetail from "./pages/FactoryDetail";
import TagsPage from "./pages/TagsPage";
import ScoringSettings from "./pages/ScoringSettings";
import FashionGoPage from "./pages/FashionGoPage";
import BulkImport from "./pages/BulkImport";
import CompareFactories from "./pages/CompareFactories";
import FactoryList from "./pages/FactoryList";
import AdminUsers from "./pages/AdminUsers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">로딩 중...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">로딩 중...</div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/factories/new" element={<ProtectedRoute><AddFactory /></ProtectedRoute>} />
            <Route path="/factories/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
            <Route path="/factories/:id" element={<ProtectedRoute><FactoryDetail /></ProtectedRoute>} />
            <Route path="/factories" element={<ProtectedRoute><FactoryList /></ProtectedRoute>} />
            <Route path="/compare" element={<ProtectedRoute><CompareFactories /></ProtectedRoute>} />
            <Route path="/tags" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
            <Route path="/scoring" element={<ProtectedRoute><ScoringSettings /></ProtectedRoute>} />
            <Route path="/fashiongo" element={<ProtectedRoute><FashionGoPage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
