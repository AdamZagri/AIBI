import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, Settings as SettingsIcon, Palette, Type, Bell, Shield, Menu } from "lucide-react";
import { User as UserEntity } from "@/entities/User";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState("Heebo");
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadUser();
    loadSettings();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await UserEntity.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
    setIsLoading(false);
  };

  const loadSettings = () => {
    const savedFontSize = localStorage.getItem("aibi_font_size");
    const savedFontFamily = localStorage.getItem("aibi_font_family");
    const savedNotifications = localStorage.getItem("aibi_notifications");
    const savedDarkMode = localStorage.getItem("aibi_dark_mode");
    const savedAutoSave = localStorage.getItem("aibi_auto_save");

    if (savedFontSize) setFontSize(parseInt(savedFontSize));
    if (savedFontFamily) setFontFamily(savedFontFamily);
    if (savedNotifications) setNotifications(JSON.parse(savedNotifications));
    if (savedDarkMode) setDarkMode(JSON.parse(savedDarkMode));
    if (savedAutoSave) setAutoSave(JSON.parse(savedAutoSave));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    
    try {
      localStorage.setItem("aibi_font_size", fontSize.toString());
      localStorage.setItem("aibi_font_family", fontFamily);
      localStorage.setItem("aibi_notifications", JSON.stringify(notifications));
      localStorage.setItem("aibi_dark_mode", JSON.stringify(darkMode));
      localStorage.setItem("aibi_auto_save", JSON.stringify(autoSave));

      // Update global CSS variables
      document.documentElement.style.setProperty("--aibi-font-size", `${fontSize}px`);
      document.documentElement.style.setProperty("--aibi-font-family", fontFamily);

      // Save to user profile if needed
      if (user) {
        await UserEntity.updateMyUserData({
          settings: {
            fontSize,
            fontFamily,
            notifications,
            darkMode,
            autoSave
          }
        });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    }
    
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="p-2 rounded-md hover:bg-gray-100">
              <Menu className="w-5 h-5" />
            </SidebarTrigger>
            <SettingsIcon className="w-8 h-8 text-teal-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">הגדרות</h1>
              <p className="text-gray-600">נהל את ההעדפות והגדרות המערכת שלך</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* User Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              פרופיל משתמש
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-teal-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{user?.full_name || "משתמש"}</h3>
                <p className="text-gray-600">{user?.email}</p>
                <p className="text-sm text-gray-500">תפקיד: {user?.role === 'admin' ? 'מנהל' : 'משתמש'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="w-5 h-5" />
              הגדרות תצוגה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="font-size" className="text-sm font-medium mb-3 block">
                  גודל פונט: {fontSize}px
                </Label>
                <Slider
                  id="font-size"
                  min={10}
                  max={24}
                  step={1}
                  value={[fontSize]}
                  onValueChange={(value) => setFontSize(value[0])}
                  className="w-full"
                />
              </div>
              
              <div>
                <Label htmlFor="font-family" className="text-sm font-medium mb-3 block">
                  סוג פונט
                </Label>
                <Select value={fontFamily} onValueChange={setFontFamily}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Heebo">Heebo</SelectItem>
                    <SelectItem value="Arial">Arial</SelectItem>
                    <SelectItem value="Tahoma">Tahoma</SelectItem>
                    <SelectItem value="David">David</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <Label className="text-sm font-medium mb-2 block">תצוגה מקדימה</Label>
              <p className="aibi-text text-gray-700">
                זוהי דוגמה לטקסט עם ההגדרות הנוכחיות. 
                הטקסט יוצג בגודל ובסוג הפונט שבחרת.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              התראות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notifications" className="text-sm font-medium">
                  התראות מערכת
                </Label>
                <p className="text-sm text-gray-500">קבל התראות על תגובות ועדכונים</p>
              </div>
              <Switch
                id="notifications"
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-save" className="text-sm font-medium">
                  שמירה אוטומטית
                </Label>
                <p className="text-sm text-gray-500">שמור הגדרות אוטומטית</p>
              </div>
              <Switch
                id="auto-save"
                checked={autoSave}
                onCheckedChange={setAutoSave}
              />
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              מראה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="dark-mode" className="text-sm font-medium">
                  מצב כהה
                </Label>
                <p className="text-sm text-gray-500">החלף למצב כהה (בפיתוח)</p>
              </div>
              <Switch
                id="dark-mode"
                checked={darkMode}
                onCheckedChange={setDarkMode}
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              אבטחה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              <p>האבטחה מנוהלת על ידי Google Authentication</p>
              <p>כל הנתונים מוצפנים ומאובטחים</p>
            </div>
            
            <Button variant="outline" className="w-full" onClick={() => UserEntity.logout()}>
              התנתק מהמערכת
            </Button>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={saveSettings}
            disabled={isSaving}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                שומר...
              </div>
            ) : (
              "שמור הגדרות"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}