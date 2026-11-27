import { useEffect, useMemo, useState, type ComponentType, type ReactElement } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { Ionicons } from "@expo/vector-icons";

import {
  askTutorStream,
  getChapterPdfUrl,
  type ChapterView,
  type ClassroomStudentView,
  type ClassroomTeacherView,
  type Session,
  type TutorAnswer,
  type TutorStreamEvent,
} from "./index";
import { themes, type Theme } from "./theme";
import { useTabBarVisibility } from "./appChrome";

interface Props {
  session: Session;
  classroom: ClassroomTeacherView | ClassroomStudentView;
  chapter: ChapterView;
  onBack: () => void;
}

const QUICK_PROMPTS: readonly string[] = [
  "Summarize key points",
  "Generate 3 quiz questions",
  "List important vocabulary",
];

interface WebViewProps {
  source: { uri?: string; html?: string };
  style?: object;
  originWhitelist?: string[];
  scalesPageToFit?: boolean;
  nestedScrollEnabled?: boolean;
  startInLoadingState?: boolean;
  renderLoading?: () => ReactElement;
}

let NativeWebView: ComponentType<WebViewProps> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webviewMod = require("react-native-webview");
  NativeWebView = webviewMod.WebView || webviewMod.default || webviewMod;
} catch {
  NativeWebView = null;
}

function buildPdfViewerHtml(pdfStreamUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      min-height: 100vh;
      background-color: #3b3a36;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px 28px;
      overflow-x: hidden;
      /* The document scrolls inside this WebView only. Never hand the drag
         back to a native scroll view sitting behind it. */
      overscroll-behavior-y: none;
      -webkit-overflow-scrolling: touch;
    }
    #status {
      color: #f7eedd;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      padding: 24px;
      text-align: center;
    }
    #container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .page-card {
      margin-bottom: 14px;
      background: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      border-radius: 6px;
      overflow: hidden;
      width: 100%;
      max-width: 650px;
      display: flex;
      justify-content: center;
    }
    canvas {
      width: 100% !important;
      height: auto !important;
      display: block;
    }
  </style>
</head>
<body>
  <div id="status">Loading PDF document inside app...</div>
  <div id="container"></div>
  <script>
    (function() {
      const url = ${JSON.stringify(pdfStreamUrl)};
      const container = document.getElementById('container');
      const status = document.getElementById('status');

      function showError(message) {
        status.style.display = 'block';
        status.style.color = '#ffccd5';
        status.innerText = message;
      }

      if (!window.pdfjsLib) {
        showError('Unable to load the PDF renderer. Check your internet connection and reopen the chapter.');
        return;
      }

      (async function renderDocument() {
        try {
          const pdf = await pdfjsLib.getDocument({ url: url, withCredentials: false }).promise;
          if (!pdf.numPages) {
            showError('This PDF has no pages to display.');
            return;
          }
          status.style.display = 'none';

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const card = document.createElement('div');
            card.className = 'page-card';
            const canvas = document.createElement('canvas');
            card.appendChild(canvas);
            container.appendChild(card);

            const viewport = page.getViewport({ scale: 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
              canvasContext: canvas.getContext('2d'),
              viewport: viewport
            }).promise;
          }
        } catch (err) {
          showError('Unable to render this PDF: ' + (err && err.message ? err.message : 'Unknown error'));
        }
      })();
    })();
  </script>
</body>
</html>`;
}

function InAppPdfViewer({
  chapterId,
  theme,
  fullscreen = false,
}: {
  chapterId: string;
  theme: Theme;
  fullscreen?: boolean;
}) {
  const streamUrl = useMemo(() => getChapterPdfUrl(chapterId), [chapterId]);
  const htmlContent = useMemo(() => buildPdfViewerHtml(streamUrl), [streamUrl]);

  if (!NativeWebView) {
    return (
      <View style={[styles.pdfFallback, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.pdfDescription, { color: theme.subtext }]}>
          Visual PDF viewer requires WebView.
        </Text>
      </View>
    );
  }

  // iOS renders the PDF with its native viewer, Android with pdf.js.
  // Either way the WebView owns the vertical drag inside its own bounds.
  return (
    <View style={[styles.pdfWrapper, fullscreen && styles.pdfWrapperFullscreen]}>
      <NativeWebView
        source={Platform.OS === "ios" ? { uri: streamUrl } : { html: htmlContent }}
        style={styles.pdfViewer}
        originWhitelist={["*"]}
        scalesPageToFit={true}
        nestedScrollEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.accent} />
          </View>
        )}
      />
    </View>
  );
}

function getMarkdownStyles(theme: Theme) {
  return {
    body: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: theme.text,
      fontSize: 19,
      fontWeight: "700" as const,
      marginTop: 10,
      marginBottom: 6,
    },
    heading2: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700" as const,
      marginTop: 8,
      marginBottom: 4,
    },
    heading3: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: "700" as const,
      marginTop: 8,
      marginBottom: 4,
    },
    paragraph: {
      marginTop: 2,
      marginBottom: 6,
      lineHeight: 22,
      color: theme.text,
    },
    strong: {
      fontWeight: "700" as const,
      color: theme.text,
    },
    em: {
      fontStyle: "italic" as const,
    },
    bullet_list: {
      marginTop: 2,
      marginBottom: 6,
    },
    ordered_list: {
      marginTop: 2,
      marginBottom: 6,
    },
    list_item: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      marginBottom: 4,
    },
    bullet_list_icon: {
      marginLeft: 0,
      marginRight: 6,
      fontSize: 15,
      color: theme.accent,
    },
    bullet_list_content: {
      flex: 1,
    },
    code_inline: {
      backgroundColor: theme.accentSoft,
      color: theme.accent,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 13,
    },
    blockquote: {
      backgroundColor: theme.accentSoft,
      borderLeftColor: theme.accent,
      borderLeftWidth: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginVertical: 4,
    },
  };
}

export default function ChapterDetailScreen({
  session,
  classroom,
  chapter,
  onBack,
}: Props) {
  const theme = themes[session.user.role];
  const mdStyles = useMemo(() => getMarkdownStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<"document" | "tutor">("document");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const setTabBarHidden = useTabBarVisibility();

  // Ask AI state
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [citations, setCitations] = useState<TutorAnswer["citations"]>([]);
  const [error, setError] = useState<string | null>(null);

  // Full-screen reading takes over the whole device screen: hide the app's
  // bottom tab bar (through the tab shell) as well as the status bar.
  useEffect(() => {
    setTabBarHidden(isFullscreen);
    return () => setTabBarHidden(false);
  }, [isFullscreen, setTabBarHidden]);

  // Android hardware back exits full screen before leaving the chapter.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setIsFullscreen(false);
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen]);

  const ask = (promptText?: string) => {
    Keyboard.dismiss();
    const query = (promptText ?? question).trim();
    if (!query) return;

    setAsking(true);
    setError(null);
    setStreamed("");
    setCitations([]);
    if (!promptText) setQuestion("");

    askTutorStream(
      session.token,
      classroom.id,
      query,
      chapter.id,
      (event: TutorStreamEvent) => {
        if (event.type === "citations") {
          setCitations(event.citations);
        } else if (event.type === "token") {
          setStreamed((prev) => prev + event.text);
        } else if (event.type === "error") {
          setError(event.text);
        } else if (event.type === "done") {
          setAsking(false);
        }
      },
      (message: string) => {
        setError(message);
        setAsking(false);
      },
    );
  };

  const statusColor =
    chapter.status === "ready"
      ? "#15803d"
      : chapter.status === "failed"
      ? theme.danger
      : theme.subtext;
  const statusLabel =
    chapter.status === "ready"
      ? `Ready (${chapter.chunk_count} chunks indexed)`
      : chapter.status === "failed"
      ? "Failed processing"
      : "Processing PDF...";

  return (
    <KeyboardAvoidingView
      style={[styles.container, isFullscreen ? styles.fullscreenContainer : { backgroundColor: theme.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Immersive reading: hide the system status bar while full screen. */}
      <StatusBar hidden={isFullscreen} />

      {!isFullscreen ? (
        <>
          {/* Top Header */}
          <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
            <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={theme.accent} />
              <Text style={[styles.backText, { color: theme.accent }]}>Back</Text>
            </TouchableOpacity>
            <View style={styles.headerRightGroup}>
              <Ionicons name="school-outline" size={14} color={theme.subtext} />
              <Text style={[styles.headerSubtext, { color: theme.subtext }]} numberOfLines={1}>
                {classroom.name}
              </Text>
            </View>
          </View>

          {/* Chapter title & indexing status. Kept fixed below the header so the
              document pane can use all of the remaining height. */}
          <View style={[styles.chapterBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.chapterIconWrap, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="book-outline" size={17} color={theme.accent} />
            </View>
            <View style={styles.chapterMeta}>
              <Text numberOfLines={2} style={[styles.chapterTitle, { color: theme.text }]}>
                {chapter.title}
              </Text>
              <Text style={[styles.statusBadge, { color: statusColor }]}>{statusLabel}</Text>
              {chapter.warning ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fffbeb", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, marginTop: 4, borderWidth: 1, borderColor: "#fde68a" }}>
                  <Ionicons name="warning-outline" size={12} color="#b45309" />
                  <Text numberOfLines={2} style={{ color: "#b45309", fontSize: 11, fontWeight: "500", flex: 1 }}>{chapter.warning}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Document / Ask AI switcher */}
          <View style={[styles.segmented, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.segment, activeTab === "document" && { backgroundColor: theme.surface }]}
              onPress={() => {
                Keyboard.dismiss();
                setActiveTab("document");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="document-text-outline"
                size={14}
                color={activeTab === "document" ? theme.accent : theme.subtext}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: activeTab === "document" ? theme.accent : theme.subtext },
                ]}
              >
                Document
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, activeTab === "tutor" && { backgroundColor: theme.surface }]}
              onPress={() => {
                Keyboard.dismiss();
                setActiveTab("tutor");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={14}
                color={activeTab === "tutor" ? theme.accent : theme.subtext}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: activeTab === "tutor" ? theme.accent : theme.subtext },
                ]}
              >
                Ask AI
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <View style={isFullscreen ? styles.fullscreenContent : styles.content}>
        {/* Chapter document. Deliberately NOT wrapped in a ScrollView: nesting a
            scrollable WebView inside one let the parent steal every vertical
            drag, which is why the PDF pages could never be scrolled. The same
            viewer instance is kept mounted when going full screen, so the
            reader stays on the page they were reading. */}
        <View
          style={
            isFullscreen
              ? styles.fullscreenDocumentPane
              : [styles.documentPane, { backgroundColor: theme.surface, borderColor: theme.border }]
          }
          pointerEvents={activeTab === "document" || isFullscreen ? "auto" : "none"}
        >
          {!isFullscreen ? (
            <View style={[styles.docToolbar, { borderBottomColor: theme.border }]}>
              <Text style={[styles.docToolbarTitle, { color: theme.text }]}>Chapter Document</Text>
              <TouchableOpacity
                style={[styles.fullscreenBtn, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}
                onPress={() => {
                  Keyboard.dismiss();
                  setIsFullscreen(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Open document in full screen"
              >
                <Ionicons name="expand-outline" size={13} color={theme.accent} style={{ marginRight: 4 }} />
                <Text style={[styles.fullscreenBtnText, { color: theme.accent }]}>Full Screen</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.viewerHost}>
            <InAppPdfViewer chapterId={chapter.id} theme={theme} fullscreen={isFullscreen} />
          </View>
        </View>

        {/* Ask AI pane — floats above the document so the PDF keeps its scroll
            position while the student/teacher asks a question. */}
        {!isFullscreen && activeTab === "tutor" ? (
          <View style={[styles.tutorPane, { backgroundColor: theme.bg }]}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.tutorScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.aiHeaderRow}>
                  <Ionicons name="sparkles" size={17} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Ask AI about this chapter</Text>
                </View>
                <Text style={[styles.aiSubtitle, { color: theme.subtext }]}>
                  AI answers are grounded in this chapter&apos;s indexed content.
                </Text>

                {/* Quick Prompts */}
                <View style={styles.quickPromptsContainer}>
                  {QUICK_PROMPTS.map((prompt) => (
                    <TouchableOpacity
                      key={prompt}
                      style={[
                        styles.promptChip,
                        { backgroundColor: theme.accentSoft, borderColor: theme.border },
                      ]}
                      onPress={() => ask(prompt)}
                      disabled={asking}
                    >
                      <Text style={[styles.promptChipText, { color: theme.accent }]}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
                  ]}
                  placeholder="Ask anything about this chapter..."
                  placeholderTextColor={theme.subtext}
                  multiline
                  value={question}
                  onChangeText={setQuestion}
                />

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.accent, opacity: asking ? 0.6 : 1 }]}
                  onPress={() => ask()}
                  disabled={asking}
                >
                  <Text style={styles.buttonText}>{asking ? "Thinking…" : "Ask AI"}</Text>
                </TouchableOpacity>

                {error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}

                {/* AI Response Box */}
                {streamed || asking ? (
                  <View
                    style={[
                      styles.answerBox,
                      { backgroundColor: theme.bg, borderColor: theme.border },
                    ]}
                  >
                    {streamed ? (
                      <Markdown style={mdStyles}>
                        {streamed}
                      </Markdown>
                    ) : (
                      <Text style={[styles.searchingText, { color: theme.subtext }]}>
                        Reading chapter passages…
                      </Text>
                    )}

                    {asking ? (
                      <ActivityIndicator color={theme.accent} style={styles.spinner} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* Floating chrome over the full-screen document: a title pill and an
          exit button. `box-none` keeps the PDF underneath fully scrollable. */}
      {isFullscreen ? (
        <View style={styles.fullscreenChrome} pointerEvents="box-none">
          <View style={styles.fullscreenTitlePill} pointerEvents="none">
            <Ionicons name="book-outline" size={13} color="#f7eedd" />
            <Text numberOfLines={1} style={styles.fullscreenTitle}>
              {chapter.title}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.fullscreenCloseBtn}
            onPress={() => setIsFullscreen(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Exit full screen"
          >
            <Ionicons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : (StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 44);

const FULLSCREEN_TOP_INSET =
  Platform.OS === "ios" ? 60 : (StatusBar.currentHeight ?? 24) + 10;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: TOP_HEADER_PADDING,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingRight: 12,
  },
  backText: {
    fontWeight: "700",
    fontSize: 16,
    marginLeft: 2,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
    gap: 4,
  },
  headerSubtext: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  scroll: {
    flex: 1,
  },
  tutorScrollContent: {
    paddingBottom: 16,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  chapterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  chapterIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterMeta: {
    flex: 1,
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  segmented: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  documentPane: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  docToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  docToolbarTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  viewerHost: {
    flex: 1,
  },
  tutorPane: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fullscreenContainer: {
    backgroundColor: "#111111",
  },
  fullscreenContent: {
    flex: 1,
  },
  fullscreenDocumentPane: {
    flex: 1,
    backgroundColor: "#111111",
  },
  fullscreenChrome: {
    position: "absolute",
    top: FULLSCREEN_TOP_INSET,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fullscreenTitlePill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(17,17,17,0.78)",
  },
  fullscreenTitle: {
    flexShrink: 1,
    color: "#f7eedd",
    fontSize: 13,
    fontWeight: "700",
  },
  fullscreenCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.78)",
  },
  fullscreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fullscreenBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  pdfWrapper: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  pdfWrapperFullscreen: {
    backgroundColor: "#111111",
  },
  pdfViewer: {
    flex: 1,
    width: "100%",
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  pdfFallback: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pdfDescription: {
    fontSize: 13,
    textAlign: "center",
  },
  aiHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  aiSubtitle: {
    fontSize: 13,
    marginBottom: 10,
  },
  quickPromptsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  promptChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  promptChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
  },
  answerBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
  },
  spinner: {
    marginTop: 10,
  },
  searchingText: {
    fontSize: 14,
    fontStyle: "italic",
  },
});
