import { useEffect } from "react";
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

import ScoringSettings from "./pages/ScoringSettings";
import FashionGoPage from "./pages/FashionGoPage";
import BulkImport from "./pages/BulkImport";

import FactoryList from "./pages/FactoryList";
import AIFactorySearch from "./pages/AIFactorySearch";
import AIVendors from "./pages/AIVendors";
import AIVendorDetail from "./pages/AIVendorDetail";
import ProductList from "./pages/ProductList";
import PricingSettings from "./pages/PricingSettings";
import AILearning from "./pages/AILearning";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { seedFactoriesIfNeeded } from "./lib/seedFactories";

const queryClient = new QueryClient();

const isDev = import.meta.env.DEV;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) seedFactoriesIfNeeded();
  }, [user]);

  if (isDev) return <AppLayout>{children}</AppLayout>;
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">로딩 중...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (isDev) return <Navigate to="/" replace />;
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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/factories/new" element={<ProtectedRoute><AddFactory /></ProtectedRoute>} />
            <Route path="/factories/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
            <Route path="/factories/:id" element={<ProtectedRoute><FactoryDetail /></ProtectedRoute>} />
            <Route path="/factories" element={<ProtectedRoute><FactoryList /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><ProductList /></ProtectedRoute>} />
            <Route path="/ai-search" element={<ProtectedRoute><AIFactorySearch /></ProtectedRoute>} />
            
            
            <Route path="/scoring" element={<ProtectedRoute><ScoringSettings /></ProtectedRoute>} />
            <Route path="/fashiongo" element={<ProtectedRoute><FashionGoPage /></ProtectedRoute>} />
            <Route path="/ai-vendors" element={<ProtectedRoute><AIVendors /></ProtectedRoute>} />
            <Route path="/ai-vendors/:id" element={<ProtectedRoute><AIVendorDetail /></ProtectedRoute>} />
            <Route path="/settings/pricing" element={<ProtectedRoute><PricingSettings /></ProtectedRoute>} />
            <Route path="/admin/ai-training" element={<ProtectedRoute><AILearning /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
