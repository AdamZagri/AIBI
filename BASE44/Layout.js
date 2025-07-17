import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  MessageCircle,
  BarChart3,
  Settings,
  User,
  Menu,
  X,
  LogOut,
  Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { User as UserEntity } from '@/entities/User';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ━━━━━━━ קישורי ניווט ━━━━━━━ */
const navigationItems = [
  { title: 'צ׳אט ERP', url: createPageUrl('Chat'), icon: MessageCircle },
  { title: 'תובנות', url: createPageUrl('Insights'), icon: BarChart3 },
  { title: 'הגדרות', url: createPageUrl('Settings'), icon: Settings },
];

export default function Layout({ children }) {
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Heebo');
  const [showFontDialog, setShowFontDialog] = useState(false);

  /* ───── טעינת משתמש והגדרות פונט ───── */
  useEffect(() => {
    (async () => {
      try {
        const me = await UserEntity.me();
        setUser(me);
      } finally {
        setIsLoading(false);
      }
    })();

    const savedSize = localStorage.getItem('aibi_font_size');
    const savedFamily = localStorage.getItem('aibi_font_family');
    if (savedSize) setFontSize(+savedSize);
    if (savedFamily) setFontFamily(savedFamily);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--aibi-font-size',
      `${fontSize}px`,
    );
    document.documentElement.style.setProperty(
      '--aibi-font-family',
      fontFamily,
    );
  }, [fontSize, fontFamily]);

  /* ───── קריאות עזר ───── */
  const handleFontSizeChange = (v) => {
    const size = v[0];
    setFontSize(size);
    localStorage.setItem('aibi_font_size', size);
  };

  const handleFontFamilyChange = (fam) => {
    setFontFamily(fam);
    localStorage.setItem('aibi_font_family', fam);
  };

  const handleLogout = () => UserEntity.logout().then(() => setUser(null));
  const handleLogin = () => UserEntity.login();

  /* ━━━━━━━ מסך טעינה / התחברות ━━━━━━━ */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-teal-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">טוען…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-teal-50 to-blue-50" dir="rtl">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg w-80">
          <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">AI-BI</h1>
          <Button onClick={handleLogin} className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-xl">
            התחבר עם Google
          </Button>
        </div>
      </div>
    );
  }

  /* ━━━━━━━ פריסה ראשית ━━━━━━━ */
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50" dir="rtl">
        <style>
          {`
            :root{
              --aibi-font-size:${fontSize}px;
              --aibi-font-family:${fontFamily};
            }
            .aibi-text{font-size:var(--aibi-font-size);font-family:var(--aibi-font-family),Arial,sans-serif;}
            /* Sidebar right */
            [data-sidebar='sidebar']{order:2}
            main{order:1}
          `}
        </style>

        {/* תוכן מרכזי */}
        <main className="flex-1 flex flex-col">
          {/* אזור התוכן */}
          <div className="flex-1 overflow-auto rtl-layout">{children}</div>
        </main>

        {/* ───────── Sidebar מימין ───────── */}
        <Sidebar side="right" className="border-r border-gray-200" variant="sidebar">
          <SidebarHeader className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-r from-teal-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-gray-900">AI-BI</span>
              </div>
              <SidebarTrigger className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </SidebarTrigger>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-2">
            <SidebarGroup>
              <SidebarGroupLabel className="text-sm font-medium text-gray-500 px-3 py-2">
                ניווט
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        className={`hover:bg-teal-50 hover:text-teal-700 rounded-lg mb-1 ${
                          location.pathname === item.url ? 'bg-teal-50 text-teal-700' : ''
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name || user.email}</p>
              </div>

              {/* תפריט הגדרות קטנטן */}
              <Dialog open={showFontDialog} onOpenChange={setShowFontDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100">
                    <Type className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl" className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>הגדרות פונט</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6">
                    <div>
                      <Label className="block mb-2">גודל פונט: {fontSize}px</Label>
                      <Slider min={10} max={24} step={1} value={[fontSize]} onValueChange={handleFontSizeChange} />
                    </div>
                    <div>
                      <Label className="block mb-2">סוג פונט</Label>
                      <Select value={fontFamily} onValueChange={handleFontFamilyChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Heebo">Heebo</SelectItem>
                          <SelectItem value="Arial">Arial</SelectItem>
                          <SelectItem value="Tahoma">Tahoma</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 ml-2" />
                    התנתק
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarFooter>
        </Sidebar>
      </div>
    </SidebarProvider>
  );
}
