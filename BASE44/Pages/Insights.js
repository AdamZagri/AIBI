import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Play, Save, Share2, X, AlertCircle, CheckCircle, Menu } from "lucide-react";
import { User as UserEntity } from "@/entities/User";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SidebarTrigger } from "@/components/ui/sidebar";
import InsightCard from "../components/insights/InsightCard";

const API_BASE_URL = "https://aibi.cloudline.co.il";

const DOMAIN_FILTERS = [
  { key: "all", label: "הכל" },
  { key: "sales", label: "מכירות" },
  { key: "inventory", label: "מלאי" },
  { key: "customers", label: "לקוחות" },
  { key: "finance", label: "כספים" },
  { key: "operations", label: "תפעול" },
];

export default function Insights() {
  const [insights, setInsights] = useState([]);
  const [filteredInsights, setFilteredInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("all");
  const [user, setUser] = useState(null);
  const [executingInsight, setExecutingInsight] = useState(null);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUser();
    loadInsights();
  }, []);

  useEffect(() => {
    filterInsights();
  }, [insights, searchTerm, selectedDomain]);

  const loadUser = async () => {
    try {
      setUser(await UserEntity.me());
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const loadInsights = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${API_BASE_URL}/api/insights`, {
        method: "GET",
        mode: 'cors',
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setInsights(data.data || []);
      } else {
        setError(`שגיאה בטעינת התובנות: ${response.status}`);
      }
    } catch (error) {
      setError(`שגיאת רשת: ${error.message}`);
    }
    setIsLoading(false);
  };

  const filterInsights = () => {
    let filtered = insights;
    if (searchTerm) {
      filtered = filtered.filter(insight =>
        (insight.title && insight.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (insight.description && insight.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (selectedDomain !== "all") {
      filtered = filtered.filter(insight => insight.module === selectedDomain);
    }
    setFilteredInsights(filtered);
  };

  const executeInsight = async (insight) => {
    if (!user?.email) {
      setError("נדרשת התחברות לביצוע תובנות");
      return;
    }
    setExecutingInsight(insight.id);
    setShowExecuteDialog(true);
    setExecutionResult(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(`${API_BASE_URL}/api/insights/${insight.id}/actions`, {
        method: "POST",
        mode: 'cors',
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ action: "investigate", user: user.email }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        setExecutionResult({ success: true, data: result, message: "התובנה נבדקה בהצלחה" });
      } else {
        const errorText = await response.text();
        setExecutionResult({ success: false, error: `שגיאה בביצוע התובנה: ${response.status}`, details: errorText });
      }
    } catch (error) {
      setExecutionResult({ success: false, error: `שגיאת רשת: ${error.message}` });
    }
    setExecutingInsight(null);
  };
  
  const renderLoadingSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader><div className="h-5 bg-gray-200 rounded mb-2 w-3/4"></div><div className="h-3 bg-gray-200 rounded w-1/4"></div></CardHeader>
          <CardContent><div className="h-3 bg-gray-200 rounded mb-2"></div><div className="h-3 bg-gray-200 rounded w-5/6"></div></CardContent>
        </Card>
      ))}
    </div>
  );

  const renderExecutionResult = () => {
    if (executingInsight) {
        return (
            <div className="flex items-center gap-2 text-teal-600 p-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                <span>מבצע...</span>
            </div>
        );
    }
    if (executionResult) {
        const wrapperClass = executionResult.success ? "bg-green-50" : "bg-red-50";
        const textClass = executionResult.success ? "text-green-700" : "text-red-700";
        const Icon = executionResult.success ? CheckCircle : AlertCircle;
        const message = executionResult.message || executionResult.error;

        return (
            <div className={`p-4 rounded-lg ${wrapperClass}`}>
                <div className={`flex items-center gap-2 font-bold ${textClass}`}>
                    <Icon className="w-5 h-5" /> {message}
                </div>
                {(executionResult.data || executionResult.details) && (
                    <pre className="text-xs mt-2 bg-black/5 p-2 rounded overflow-x-auto">
                        {JSON.stringify(executionResult.data || executionResult.details, null, 2)}
                    </pre>
                )}
            </div>
        );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="p-2 rounded-md hover:bg-gray-100 lg:hidden">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">תובנות עסקיות</h1>
                <p className="text-gray-600 mt-1">{filteredInsights.length} תובנות מתוך {insights.length}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-80">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="חפש תובנות..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pr-10 text-right" dir="rtl" />
              </div>
              <Button variant="outline" onClick={loadInsights} disabled={isLoading}>{isLoading ? "טוען..." : "רענן"}</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-6">
            {DOMAIN_FILTERS.map((filter) => (
              <Button key={filter.key} variant={selectedDomain === filter.key ? "default" : "outline"} size="sm" onClick={() => setSelectedDomain(filter.key)} className={selectedDomain === filter.key ? "bg-teal-600 hover:bg-teal-700" : "hover:bg-gray-50"}>
                {filter.label}
              </Button>
            ))}
            {(searchTerm || selectedDomain !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(""); setSelectedDomain("all"); }} className="text-gray-500 hover:text-gray-700"}><X className="w-4 h-4 ml-2" />נקה</Button>
            )}
          </div>
        </div>
      </div>
      
      {error && (
        <div className="px-6 py-4"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert></div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        {isLoading ? renderLoadingSkeleton() : (
          <>
            {filteredInsights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredInsights.map((insight) => (
                  <InsightCard 
                    key={insight.id}
                    insight={insight}
                    onExecute={executeInsight}
                    isExecuting={executingInsight === insight.id}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-500 text-lg mb-2">לא נמצאו תובנות</div>
                <p className="text-gray-400">נסה לשנות את הסינונים או החיפוש</p>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>תוצאות ביצוע תובנה</DialogTitle></DialogHeader>
            {renderExecutionResult()}
        </DialogContent>
      </Dialog>
    </div>
  );
}