import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Save, Share2, TrendingUp, AlertTriangle } from "lucide-react";

const URGENCY_CONFIG = {
    low: { label: "נמוכה", color: "bg-gray-100 text-gray-800", icon: TrendingUp },
    medium: { label: "בינונית", color: "bg-blue-100 text-blue-800", icon: TrendingUp },
    high: { label: "גבוהה", color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
    critical: { label: "קריטית", color: "bg-red-100 text-red-800", icon: AlertTriangle },
};

const getUrgencyConfig = (urgency) => URGENCY_CONFIG[urgency] || URGENCY_CONFIG.low;

export default function InsightCard({ insight, onExecute, isExecuting }) {
    const urgencyConf = getUrgencyConfig(insight.urgency);
    const UrgencyIcon = urgencyConf.icon;

    return (
        <Card className="hover:shadow-lg transition-shadow duration-300 flex flex-col">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2 mb-2">
                    <Badge className={`${urgencyConf.color} font-semibold`}>
                        <UrgencyIcon className="w-3.5 h-3.5 ml-1.5" />
                        דחיפות: {urgencyConf.label}
                    </Badge>
                    <Badge variant="outline">{insight.module}</Badge>
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900">{insight.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col">
                <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-grow">{insight.description}</p>
                <div className="text-xs text-gray-500 flex justify-between items-center mt-2">
                    <span>השפעה: {insight.impact_score}/10</span>
                    <span>ביטחון: {(insight.confidence_score * 100).toFixed(0)}%</span>
                </div>
                <div className="border-t -mx-6 mt-4 mb-0 pt-4 px-6 flex gap-2">
                    <Button size="sm" onClick={() => onExecute(insight)} disabled={isExecuting} className="bg-teal-600 hover:bg-teal-700 text-white flex-1">
                        {isExecuting ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                            <Play className="w-4 h-4 ml-2" />
                        )}
                        בצע חקירה
                    </Button>
                    <Button variant="outline" size="sm"><Share2 className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm"><Save className="w-4 h-4" /></Button>
                </div>
            </CardContent>
        </Card>
    );
}