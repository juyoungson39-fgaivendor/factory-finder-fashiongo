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

import BulkImport from "./pages/BulkImport";

import FactoryList from "./pages/FactoryList";
import FactoryRanking from "./pages/FactoryRanking";
import AIFactorySearch from "./pages/AIFactorySearch";
import AIVendors from "./pages/AIVendors";
import AIVendorDetail from "./pages/AIVendorDetail";
import AIVendorProducts from "./pages/AIVendorProducts";
import ProductList from "./pages/ProductList";
import SourcingTargetFG from "./pages/SourcingTargetFG";
import SourcingTargetOther from "./pages/SourcingTargetOther";
import SourceableAgent from "./pages/SourceableAgent";
import SourceableCSV from "./pages/SourceableCSV";
import PricingSettings from "./pages/PricingSettings";
import AlibabaSettings from "./pages/AlibabaSettings";
import AILearning from "./pages/AILearning";
import AccountManagement from "./pages/AccountManagement";
import ResetPassword from "./pages/ResetPassword";
import TrendRecommendation from "./pages/TrendRecommendation";
import NotFound from "./pages/NotFound";
import { seedFactoriesIfNeeded } from "./lib/seedFactories";
import { isDevelopmentAccessMode } from "./lib/runtimeMode";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) seedFactoriesIfNeeded();
  }, [user]);

  // Dev mode: allow access but don't force — if user exists, use normal flow
  if (isDevelopmentAccessMode && !user && !loading) return <AppLayout>{children}</AppLayout>;
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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/factories/new" element={<ProtectedRoute><AddFactory /></ProtectedRoute>} />
            <Route path="/factories/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
            <Route path="/factories/:id" element={<ProtectedRoute><FactoryDetail /></ProtectedRoute>} />
            <Route path="/factories" element={<ProtectedRoute><FactoryList /></ProtectedRoute>} />
            <Route path="/factories/ranking" element={<ProtectedRoute><FactoryRanking /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><ProductList /></ProtectedRoute>} />
            <Route path="/products/target-fg" element={<ProtectedRoute><SourcingTargetFG /></ProtectedRoute>} />
            <Route path="/products/target-other" element={<ProtectedRoute><SourcingTargetOther /></ProtectedRoute>} />
            <Route path="/products/sourceable-agent" element={<ProtectedRoute><SourceableAgent /></ProtectedRoute>} />
            <Route path="/products/sourceable-csv" element={<ProtectedRoute><SourceableCSV /></ProtectedRoute>} />
            <Route path="/ai-search" element={<ProtectedRoute><AIFactorySearch /></ProtectedRoute>} />
            
            
            <Route path="/scoring" element={<ProtectedRoute><ScoringSettings /></ProtectedRoute>} />
            
            <Route path="/ai-vendors" element={<ProtectedRoute><AIVendors /></ProtectedRoute>} />
            <Route path="/ai-vendors/:id" element={<ProtectedRoute><AIVendorDetail /></ProtectedRoute>} />
            <Route path="/ai-vendors/:id/products" element={<ProtectedRoute><AIVendorProducts /></ProtectedRoute>} />
            <Route path="/settings/pricing" element={<ProtectedRoute><PricingSettings /></ProtectedRoute>} />
            <Route path="/settings/alibaba" element={<ProtectedRoute><AlibabaSettings /></ProtectedRoute>} />
            <Route path="/admin/ai-training" element={<ProtectedRoute><AILearning /></ProtectedRoute>} />
            <Route path="/admin/accounts" element={<ProtectedRoute><AccountManagement /></ProtectedRoute>} />
            <Route path="/trend" element={<ProtectedRoute><TrendRecommendation /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
