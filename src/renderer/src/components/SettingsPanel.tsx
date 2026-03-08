import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@renderer/stores/useAppStore';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import { Slider } from '@renderer/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import {
  CheckCircle2,
  RefreshCw,
  Settings2,
  Wand2,
  Rocket,
  Sparkles,
  Info,
  Globe,
  Github,
  MessageCircle,
  Download,
  AlertCircle,
} from 'lucide-react';

interface SettingsPanelProps {
  onOpenGuide?: () => void;
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error';
type Provider = 'openai' | 'anthropic' | 'moonshot' | 'deepseek' | 'google';

const UPDATE_FEED_URL = 'https://kivode.com/version.json';

const providerMeta: Record<Provider, { name: string }> = {
  openai: { name: 'OpenAI' },
  anthropic: { name: 'Anthropic' },
  moonshot: { name: 'Moonshot' },
  deepseek: { name: 'DeepSeek' },
  google: { name: 'Google' },
};

const OpenAIIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/></svg>
);
const AnthropicIcon = ({ className }: { className?: string }) => (<svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"/></svg>);
const GoogleIcon = ({ className }: { className?: string }) => (<svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z"/><path d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z"/><path d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z"/><path d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z"/></svg>);
const MoonshotIcon = ({ className }: { className?: string }) => (<svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z"></path><path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z"></path></svg>);
const DeepSeekIcon = ({ className }: { className?: string }) => (<svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588z"></path></svg>);

const ProviderIcon = ({ provider, className }: { provider: Provider; className?: string }) => {
  switch (provider) {
    case 'openai': return <OpenAIIcon className={className} />;
    case 'anthropic': return <AnthropicIcon className={className} />;
    case 'moonshot': return <MoonshotIcon className={className} />;
    case 'deepseek': return <DeepSeekIcon className={className} />;
    case 'google': return <GoogleIcon className={className} />;
    default: return null;
  }
};

export function SettingsPanel({ onOpenGuide }: SettingsPanelProps) {
  const { settings, updateSettings, theme, setTheme, addToast, setCurrentView } = useAppStore();

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateMsg, setUpdateMsg] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [changelog, setChangelog] = useState<string[]>([]);

  const [keys, setKeys] = useState<Record<Provider, string>>({
    openai: '',
    anthropic: '',
    moonshot: '',
    deepseek: '',
    google: '',
  });

  useEffect(() => {
    const load = async () => {
      const version = await window.electronAPI.app.getVersion();
      setAppVersion(version);

      setKeys({ openai: '', anthropic: '', moonshot: '', deepseek: '', google: '' });
    };
    load();
  }, []);

  const checkUpdates = async () => {
    try {
      setUpdateStatus('checking');
      setUpdateMsg('Checking for updates...');
      const res = await window.electronAPI.updates.check(UPDATE_FEED_URL);
      const remote = res?.data?.version || res?.data?.latestVersion;
      const notes = res?.data?.releaseNotes || '';
      const logs = res?.data?.changelog || [];
      const url = res?.data?.downloadUrl || '';

      setLatestVersion(remote || '');
      setReleaseNotes(notes);
      setChangelog(Array.isArray(logs) ? logs : []);
      setDownloadUrl(url);

      if (remote && remote !== appVersion) {
        setUpdateStatus('available');
        setUpdateMsg(`New version available: ${remote}`);
      } else {
        setUpdateStatus('up-to-date');
        setUpdateMsg('You are using the latest version.');
      }
    } catch (error: any) {
      setUpdateStatus('error');
      setUpdateMsg(error.message || 'Failed to check for updates');
    }
  };

  const saveApiKey = async (provider: Provider) => {
    await window.electronAPI.store.setApiKey(provider, keys[provider] || '');
    addToast({ type: 'success', title: 'Saved', message: `${providerMeta[provider].name} API key saved` });
  };

  const editorSummary = useMemo(
    () => `${settings.fontSize}px • tab ${settings.tabSize} • ${settings.wordWrap ? 'wrap' : 'nowrap'} • ${settings.autoSave ? 'autosave on' : 'autosave off'}`,
    [settings]
  );

  return (
    <div className="h-full bg-background">
      <ScrollArea className="h-full">
        <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
                <h2 className="mt-1 text-2xl font-semibold">Professional workspace setup</h2>
                <p className="mt-2 text-sm text-muted-foreground">Configure editor, AI providers, updates, and app info from one polished control center.</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/70 px-4 py-2 text-sm text-muted-foreground">{editorSummary}</div>
            </div>
          </div>

          <Tabs defaultValue="editor" className="space-y-4">
            <TabsList className="h-auto rounded-xl border border-border/70 bg-card/70 p-1">
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="ai">API Keys</TabsTrigger>
              <TabsTrigger value="updates">Updates</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>

            <TabsContent value="editor" className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                <div className="mb-4 flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary" /><h3 className="font-semibold">Editor behavior</h3></div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-4">
                    <div className="flex items-center justify-between"><Label>Word wrap</Label><Switch checked={settings.wordWrap} onCheckedChange={(v) => updateSettings({ wordWrap: v })} /></div>
                    <div className="flex items-center justify-between"><Label>Auto save</Label><Switch checked={settings.autoSave} onCheckedChange={(v) => updateSettings({ autoSave: v })} /></div>
                    <div className="flex items-center justify-between"><Label>Editor minimap</Label><Switch checked={settings.minimap} onCheckedChange={(v) => updateSettings({ minimap: v })} /></div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm"><Label>Font size</Label><span>{settings.fontSize}px</span></div>
                      <Slider value={[settings.fontSize]} min={11} max={24} step={1} onValueChange={([v]) => updateSettings({ fontSize: v })} />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm"><Label>Tab size</Label><span>{settings.tabSize}</span></div>
                      <Slider value={[settings.tabSize]} min={2} max={8} step={1} onValueChange={([v]) => updateSettings({ tabSize: v })} />
                    </div>
                    <div>
                      <Label>Theme</Label>
                      <div className="mt-2 flex gap-2">
                        <Button variant={theme === 'dark' ? 'secondary' : 'outline'} onClick={() => setTheme('dark')}>Dark</Button>
                        <Button variant={theme === 'light' ? 'secondary' : 'outline'} onClick={() => setTheme('light')}>Light</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                <div className="mb-4 flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /><h3 className="font-semibold">API Keys</h3></div>
                <div className="grid gap-4 md:grid-cols-2">
                  {(Object.keys(providerMeta) as Provider[]).map((provider) => (
                    <div key={provider} className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                          <ProviderIcon provider={provider} className="h-4 w-4" />
                        </div>
                        <Label className="capitalize text-sm font-semibold">{providerMeta[provider].name}</Label>
                      </div>
                      <Input
                        type="password"
                        placeholder={`Enter ${providerMeta[provider].name} API key`}
                        value={keys[provider] || ''}
                        onChange={(e) => setKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                      />
                      <Button size="sm" className="rounded-full" onClick={() => saveApiKey(provider)}>Save Key</Button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="updates" className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                <div className="mb-4 flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /><h3 className="font-semibold">Update center</h3></div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 p-4 text-sm">
                  <div>
                    <p>Current version: <strong>{appVersion || '...'}</strong></p>
                    {latestVersion && <p>Latest version: <strong>{latestVersion}</strong></p>}
                    <p className="mt-1 text-muted-foreground">{updateMsg || 'No update check has been performed yet.'}</p>
                  </div>
                  <Button onClick={checkUpdates} className="rounded-full"><RefreshCw className="mr-2 h-4 w-4" />Check now</Button>
                </div>

                {updateStatus === 'available' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-2 text-emerald-500"><CheckCircle2 className="h-4 w-4" />New release is available</div>
                    {releaseNotes && <p className="text-sm text-muted-foreground">{releaseNotes}</p>}
                    {changelog.length > 0 && (
                      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {changelog.slice(0, 6).map((item, idx) => <li key={idx}>{item}</li>)}
                      </ul>
                    )}
                    {downloadUrl && (
                      <Button className="rounded-full" onClick={() => window.electronAPI.shell.openPath(downloadUrl)}>
                        <Download className="mr-2 h-4 w-4" />Download update
                      </Button>
                    )}
                  </div>
                )}

                {updateStatus === 'error' && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />{updateMsg}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="about" className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-5">
                <div className="mb-4 flex items-center gap-2"><Info className="h-4 w-4 text-primary" /><h3 className="font-semibold">About Kivode+</h3></div>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p><strong className="text-foreground">Kivode+</strong> is an AI-powered coding workspace focused on clean editing, integrated preview, GitHub flow, and productive AI-assisted development.</p>
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                    <p className="font-medium text-foreground">Core features</p>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      <li>Resizable workspace panels and professional UI</li>
                      <li>Integrated code editor with formatting and diagnostics</li>
                      <li>Live preview for HTML/CSS/JS and Markdown</li>
                      <li>GitHub cloning and publishing tools</li>
                      <li>AI providers support for generation and review</li>
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" className="rounded-full" onClick={() => window.electronAPI.shell.openPath('https://github.com/aymantaha-dev')}>
                      <Github className="mr-2 h-4 w-4" />GitHub
                    </Button>
                    <Button variant="outline" className="rounded-full" onClick={() => window.electronAPI.shell.openPath('https://x.com')}>
                      <MessageCircle className="mr-2 h-4 w-4" />X / Twitter
                    </Button>
                    <Button variant="outline" className="rounded-full" onClick={() => window.electronAPI.shell.openPath('https://kivode.com')}>
                      <Globe className="mr-2 h-4 w-4" />Website
                    </Button>
                    <Button variant="outline" className="rounded-full" onClick={onOpenGuide}>
                      <Sparkles className="mr-2 h-4 w-4" />Open onboarding
                    </Button>
                    <Button variant="outline" className="rounded-full" onClick={() => setCurrentView('editor')}>Back to editor</Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
