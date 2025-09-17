'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Settings,
  User,
  Palette,
  Bell,
  Shield,
  Terminal,
  Zap,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Upload,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Moon,
  Sun,
  Monitor
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';

import { useUIStore, Theme } from '@/stores/ui-store';
import { useAgentStore } from '@/stores/agent-store';
import { useCommandStore } from '@/stores/command-store';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email address'),
  role: z.string().min(1, 'Role is required'),
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
});

const securitySchema = z.object({
  currentPassword: z.string().min(8, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type SecurityFormData = z.infer<typeof securitySchema>;

// Create Switch and Label components if they don't exist
const LabelComponent = Label || (({ htmlFor, children, className }: any) =>
  <label htmlFor={htmlFor} className={className}>{children}</label>
);

const SwitchComponent = Switch || (({ checked, onCheckedChange, disabled }: any) =>
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
    disabled={disabled}
    className="toggle"
  />
);

const TextareaComponent = Textarea || (({ className, ...props }: any) =>
  <textarea className={`w-full p-3 border rounded-md resize-y ${className}`} {...props} />
);

const SliderComponent = Slider || (({ value, onValueChange, min, max, step, className }: any) =>
  <input
    type="range"
    min={min}
    max={max}
    step={step}
    value={value?.[0] || 0}
    onChange={(e) => onValueChange?.([parseInt(e.target.value)])}
    className={`w-full ${className}`}
  />
);

export default function SettingsPage() {
  const [selectedTab, setSelectedTab] = useState('profile');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    theme,
    setTheme,
    sidebarState,
    setSidebarState,
    terminalVisible,
    setTerminalVisible,
    addNotification,
  } = useUIStore();

  const { clearAgents } = useAgentStore();
  const { clearCommands, clearHistory, clearPresets } = useCommandStore();

  // Mock user settings
  const [userSettings, setUserSettings] = useState({
    notifications: {
      email: true,
      push: false,
      desktop: true,
      agentStatus: true,
      commandCompletion: true,
      errorAlerts: true,
      securityAlerts: true,
    },
    preferences: {
      autoSave: true,
      confirmDangerousActions: true,
      showTerminalByDefault: false,
      compactMode: false,
      animationsEnabled: true,
      soundEnabled: false,
    },
    terminal: {
      fontSize: [14],
      lineHeight: [1.2],
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: [10000],
      tabSize: [4],
    },
    performance: {
      maxConcurrentCommands: [5],
      commandTimeout: [30000],
      refreshInterval: [5000],
      enableAnalytics: true,
    },
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@onsembl.ai',
      role: 'Administrator',
      bio: 'Senior DevOps Engineer specializing in AI agent orchestration and automation.',
    },
  });

  const securityForm = useForm<SecurityFormData>({
    resolver: zodResolver(securitySchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const handleProfileSubmit = useCallback(async (data: ProfileFormData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      addNotification({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Update Failed',
        description: 'Failed to update profile',
        type: 'error',
      });
    }
  }, [addNotification]);

  const handleSecuritySubmit = useCallback(async (data: SecurityFormData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      addNotification({
        title: 'Password Updated',
        description: 'Your password has been successfully changed',
        type: 'success',
      });

      securityForm.reset();
    } catch (error) {
      addNotification({
        title: 'Password Change Failed',
        description: 'Failed to update password',
        type: 'error',
      });
    }
  }, [addNotification, securityForm]);

  const handleThemeChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    addNotification({
      title: 'Theme Changed',
      description: `Switched to ${newTheme} theme`,
      type: 'success',
    });
  }, [setTheme, addNotification]);

  const handleNotificationChange = useCallback((key: string, value: boolean) => {
    setUserSettings(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: value,
      },
    }));
  }, []);

  const handlePreferenceChange = useCallback((key: string, value: boolean) => {
    setUserSettings(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [key]: value,
      },
    }));
  }, []);

  const handleTerminalSettingChange = useCallback((key: string, value: any) => {
    setUserSettings(prev => ({
      ...prev,
      terminal: {
        ...prev.terminal,
        [key]: value,
      },
    }));
  }, []);

  const handlePerformanceChange = useCallback((key: string, value: any) => {
    setUserSettings(prev => ({
      ...prev,
      performance: {
        ...prev.performance,
        [key]: value,
      },
    }));
  }, []);

  const handleExportSettings = useCallback(() => {
    try {
      const settings = {
        theme,
        sidebarState,
        terminalVisible,
        userSettings,
        timestamp: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `onsembl-settings-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification({
        title: 'Settings Exported',
        description: 'Your settings have been exported successfully',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Export Failed',
        description: 'Failed to export settings',
        type: 'error',
      });
    }
  }, [theme, sidebarState, terminalVisible, userSettings, addNotification]);

  const handleResetSettings = useCallback(() => {
    setTheme('system');
    setSidebarState('expanded');
    setTerminalVisible(false);
    setUserSettings({
      notifications: {
        email: true,
        push: false,
        desktop: true,
        agentStatus: true,
        commandCompletion: true,
        errorAlerts: true,
        securityAlerts: true,
      },
      preferences: {
        autoSave: true,
        confirmDangerousActions: true,
        showTerminalByDefault: false,
        compactMode: false,
        animationsEnabled: true,
        soundEnabled: false,
      },
      terminal: {
        fontSize: [14],
        lineHeight: [1.2],
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: [10000],
        tabSize: [4],
      },
      performance: {
        maxConcurrentCommands: [5],
        commandTimeout: [30000],
        refreshInterval: [5000],
        enableAnalytics: true,
      },
    });

    addNotification({
      title: 'Settings Reset',
      description: 'All settings have been reset to defaults',
      type: 'success',
    });
  }, [setTheme, setSidebarState, setTerminalVisible, addNotification]);

  const handleClearData = useCallback(() => {
    clearAgents();
    clearCommands();
    clearHistory();
    clearPresets();

    addNotification({
      title: 'Data Cleared',
      description: 'All application data has been cleared',
      type: 'success',
    });
  }, [clearAgents, clearCommands, clearHistory, clearPresets, addNotification]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and application preferences
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleExportSettings}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset All Settings</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all settings to their default values. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetSettings}>
                  Reset Settings
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Profile Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bio</FormLabel>
                        <FormControl>
                          <TextareaComponent
                            placeholder="Tell us about yourself..."
                            className="min-h-24"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Brief description about yourself (max 500 characters)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit">
                    <Save className="h-4 w-4 mr-2" />
                    Save Profile
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Palette className="h-5 w-5" />
                <span>Theme & Appearance</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme Selection */}
              <div className="space-y-4">
                <LabelComponent className="text-sm font-medium">Theme</LabelComponent>
                <div className="grid grid-cols-3 gap-4">
                  {(['light', 'dark', 'system'] as Theme[]).map((themeOption) => (
                    <div
                      key={themeOption}
                      className={`relative cursor-pointer rounded-lg border-2 p-4 hover:bg-muted/50 ${
                        theme === themeOption ? 'border-primary' : 'border-muted'
                      }`}
                      onClick={() => handleThemeChange(themeOption)}
                    >
                      <div className="flex items-center space-x-3">
                        {themeOption === 'light' && <Sun className="h-5 w-5" />}
                        {themeOption === 'dark' && <Moon className="h-5 w-5" />}
                        {themeOption === 'system' && <Monitor className="h-5 w-5" />}
                        <div>
                          <p className="font-medium capitalize">{themeOption}</p>
                          <p className="text-sm text-muted-foreground">
                            {themeOption === 'light' && 'Light theme'}
                            {themeOption === 'dark' && 'Dark theme'}
                            {themeOption === 'system' && 'System preference'}
                          </p>
                        </div>
                      </div>
                      {theme === themeOption && (
                        <CheckCircle className="absolute top-2 right-2 h-5 w-5 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Layout Preferences */}
              <div className="space-y-4">
                <LabelComponent className="text-sm font-medium">Layout Preferences</LabelComponent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Compact Mode</p>
                      <p className="text-sm text-muted-foreground">
                        Use smaller spacing and components
                      </p>
                    </div>
                    <SwitchComponent
                      checked={userSettings.preferences.compactMode}
                      onCheckedChange={(checked) => handlePreferenceChange('compactMode', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Animations</p>
                      <p className="text-sm text-muted-foreground">
                        Enable smooth transitions and animations
                      </p>
                    </div>
                    <SwitchComponent
                      checked={userSettings.preferences.animationsEnabled}
                      onCheckedChange={(checked) => handlePreferenceChange('animationsEnabled', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Show Terminal by Default</p>
                      <p className="text-sm text-muted-foreground">
                        Open terminal view when launching the app
                      </p>
                    </div>
                    <SwitchComponent
                      checked={userSettings.preferences.showTerminalByDefault}
                      onCheckedChange={(checked) => handlePreferenceChange('showTerminalByDefault', checked)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="h-5 w-5" />
                <span>Notification Preferences</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.notifications.email}
                    onCheckedChange={(checked) => handleNotificationChange('email', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Desktop Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Show notifications in your system tray
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.notifications.desktop}
                    onCheckedChange={(checked) => handleNotificationChange('desktop', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Agent Status Changes</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when agents go online or offline
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.notifications.agentStatus}
                    onCheckedChange={(checked) => handleNotificationChange('agentStatus', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Command Completion</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when commands finish executing
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.notifications.commandCompletion}
                    onCheckedChange={(checked) => handleNotificationChange('commandCompletion', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Error Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Notify when errors occur
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.notifications.errorAlerts}
                    onCheckedChange={(checked) => handleNotificationChange('errorAlerts', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Security Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Notify about security-related events
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.notifications.securityAlerts}
                    onCheckedChange={(checked) => handleNotificationChange('securityAlerts', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Terminal Tab */}
        <TabsContent value="terminal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Terminal className="h-5 w-5" />
                <span>Terminal Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Font Settings */}
              <div className="space-y-4">
                <LabelComponent className="text-sm font-medium">Font Settings</LabelComponent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <LabelComponent className="text-sm">Font Size</LabelComponent>
                    <SliderComponent
                      value={userSettings.terminal.fontSize}
                      onValueChange={(value) => handleTerminalSettingChange('fontSize', value)}
                      min={8}
                      max={24}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      {userSettings.terminal.fontSize[0]}px
                    </p>
                  </div>

                  <div className="space-y-2">
                    <LabelComponent className="text-sm">Line Height</LabelComponent>
                    <SliderComponent
                      value={userSettings.terminal.lineHeight}
                      onValueChange={(value) => handleTerminalSettingChange('lineHeight', value)}
                      min={1.0}
                      max={2.0}
                      step={0.1}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      {userSettings.terminal.lineHeight[0]}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cursor Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Cursor Blink</p>
                    <p className="text-sm text-muted-foreground">
                      Enable cursor blinking animation
                    </p>
                  </div>
                  <SwitchComponent
                    checked={userSettings.terminal.cursorBlink}
                    onCheckedChange={(checked) => handleTerminalSettingChange('cursorBlink', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <LabelComponent className="text-sm">Cursor Style</LabelComponent>
                  <Select
                    value={userSettings.terminal.cursorStyle}
                    onValueChange={(value) => handleTerminalSettingChange('cursorStyle', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Block</SelectItem>
                      <SelectItem value="underline">Underline</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Buffer Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <LabelComponent className="text-sm">Scrollback Buffer</LabelComponent>
                  <SliderComponent
                    value={userSettings.terminal.scrollback}
                    onValueChange={(value) => handleTerminalSettingChange('scrollback', value)}
                    min={1000}
                    max={50000}
                    step={1000}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {userSettings.terminal.scrollback[0]} lines
                  </p>
                </div>

                <div className="space-y-2">
                  <LabelComponent className="text-sm">Tab Size</LabelComponent>
                  <SliderComponent
                    value={userSettings.terminal.tabSize}
                    onValueChange={(value) => handleTerminalSettingChange('tabSize', value)}
                    min={2}
                    max={8}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {userSettings.terminal.tabSize[0]} spaces
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Security Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...securityForm}>
                <form onSubmit={securityForm.handleSubmit(handleSecuritySubmit)} className="space-y-4">
                  <FormField
                    control={securityForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showCurrentPassword ? 'text' : 'password'}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            >
                              {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={securityForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showNewPassword ? 'text' : 'password'}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={securityForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit">
                    <Save className="h-4 w-4 mr-2" />
                    Update Password
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Confirm Dangerous Actions</p>
                  <p className="text-sm text-muted-foreground">
                    Require confirmation before executing potentially harmful commands
                  </p>
                </div>
                <SwitchComponent
                  checked={userSettings.preferences.confirmDangerousActions}
                  onCheckedChange={(checked) => handlePreferenceChange('confirmDangerousActions', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-save</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically save changes to prevent data loss
                  </p>
                </div>
                <SwitchComponent
                  checked={userSettings.preferences.autoSave}
                  onCheckedChange={(checked) => handlePreferenceChange('autoSave', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Performance Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <LabelComponent className="text-sm">Max Concurrent Commands</LabelComponent>
                <SliderComponent
                  value={userSettings.performance.maxConcurrentCommands}
                  onValueChange={(value) => handlePerformanceChange('maxConcurrentCommands', value)}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  {userSettings.performance.maxConcurrentCommands[0]} commands
                </p>
              </div>

              <div className="space-y-2">
                <LabelComponent className="text-sm">Command Timeout</LabelComponent>
                <SliderComponent
                  value={userSettings.performance.commandTimeout}
                  onValueChange={(value) => handlePerformanceChange('commandTimeout', value)}
                  min={5000}
                  max={300000}
                  step={5000}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  {userSettings.performance.commandTimeout[0] / 1000}s
                </p>
              </div>

              <div className="space-y-2">
                <LabelComponent className="text-sm">Refresh Interval</LabelComponent>
                <SliderComponent
                  value={userSettings.performance.refreshInterval}
                  onValueChange={(value) => handlePerformanceChange('refreshInterval', value)}
                  min={1000}
                  max={30000}
                  step={1000}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  {userSettings.performance.refreshInterval[0] / 1000}s
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    Enable performance analytics and telemetry
                  </p>
                </div>
                <SwitchComponent
                  checked={userSettings.performance.enableAnalytics}
                  onCheckedChange={(checked) => handlePerformanceChange('enableAnalytics', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span>Danger Zone</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Application Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear All Data</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all agents, commands, presets, and history.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearData}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Clear All Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-destructive">Warning</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      These actions are irreversible and will permanently delete your data.
                      Make sure to export your settings and data before proceeding.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}