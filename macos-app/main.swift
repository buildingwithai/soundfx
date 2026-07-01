// SoundFX 6·7 — a tiny, fully native macOS menu-bar app.
// Watches the keyboard globally for the "6 then 7" sequence and plays a sound.
// No Node, no terminal: one self-contained .app that lives in the menu bar.
//
// Security: the event tap is listen-only and the only thing it ever inspects is
// whether a keystroke is part of the trigger sequence. Nothing is logged,
// stored, or sent anywhere.

import AppKit
import CoreGraphics
import Foundation
import IOKit.hid
import ServiceManagement

// MARK: - Sequence detector (a direct port of the tested JS state machine)

final class SequenceDetector {
    private let sequence: [String]
    private let windowMs: Double
    private let cooldownMs: Double
    private let onTrigger: () -> Void

    private var progress = 0
    private var lastAt: Double = 0
    private var lastTrigger = -Double.infinity // first trigger must never be swallowed

    init(sequence: [String], windowMs: Double, cooldownMs: Double = 600, onTrigger: @escaping () -> Void) {
        self.sequence = sequence
        self.windowMs = windowMs
        self.cooldownMs = cooldownMs
        self.onTrigger = onTrigger
    }

    func handle(_ key: String) {
        let t = Date().timeIntervalSince1970 * 1000

        if progress > 0 && key == sequence[progress] && (t - lastAt) <= windowMs {
            progress += 1
            lastAt = t
        } else if key == sequence[0] {
            progress = 1
            lastAt = t
        } else {
            progress = 0
            return
        }

        if progress == sequence.count {
            progress = 0
            if t - lastTrigger >= cooldownMs {
                lastTrigger = t
                onTrigger()
            }
        }
    }
}

// MARK: - Hotkey engine (global tap + playback)

final class HotkeyEngine {
    static let shared = HotkeyEngine()

    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var detector: SequenceDetector!
    private var sound: NSSound?

    private(set) var isListening = false
    var onStateChange: (() -> Void)?

    private init() {
        detector = SequenceDetector(sequence: ["6", "7"], windowMs: 400) { [weak self] in
            self?.playSound()
        }
        if let url = Bundle.main.url(forResource: "sixseven", withExtension: "mp3") {
            sound = NSSound(contentsOf: url, byReference: true)
        }
    }

    func hasPermission() -> Bool {
        return IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted
    }

    func requestPermission() {
        // Pops the system Input Monitoring prompt the first time.
        _ = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
    }

    func playSound() {
        guard let sound = sound else {
            NSSound.beep()
            return
        }
        if sound.isPlaying { sound.stop() }
        sound.play()
    }

    func start() {
        if isListening { return }

        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: { _, type, event, _ -> Unmanaged<CGEvent>? in
                // The system can disable a tap; just turn it back on.
                if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                    HotkeyEngine.shared.reenable()
                    return Unmanaged.passUnretained(event)
                }
                HotkeyEngine.shared.handle(event)
                return Unmanaged.passUnretained(event)
            },
            userInfo: nil
        ) else {
            // tapCreate returns nil when Input Monitoring is not granted.
            return
        }

        self.tap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        self.runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        isListening = true
        onStateChange?()
    }

    func stop() {
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
        tap = nil
        runLoopSource = nil
        isListening = false
        onStateChange?()
    }

    func reenable() {
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
    }

    // Pull the typed character out of the event so it is keyboard-layout safe.
    func handle(_ event: CGEvent) {
        var length = 0
        var chars = [UniChar](repeating: 0, count: 4)
        event.keyboardGetUnicodeString(maxStringLength: 4, actualStringLength: &length, unicodeString: &chars)
        guard length > 0 else { return }
        detector.handle(String(utf16CodeUnits: chars, count: length))
    }
}

// MARK: - Agent session roster (written by `soundfx agent-event`, read here)

struct AgentSession: Codable {
    let label: String?
    let project: String?
    let state: String?
    let lastEvent: String?
    let lastEventAt: Double?
}

struct SessionsFile: Codable { let sessions: [String: AgentSession] }
struct MuteFile: Codable { let until: Double? }

enum AgentStore {
    static let sessionsURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".soundfx-agent-sessions.json")
    static let muteURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".soundfx-agent-mute.json")

    static func readSessions() -> [(key: String, session: AgentSession)] {
        guard let data = try? Data(contentsOf: sessionsURL),
              let parsed = try? JSONDecoder().decode(SessionsFile.self, from: data) else { return [] }
        return parsed.sessions
            .map { (key: $0.key, session: $0.value) }
            .sorted { ($0.session.lastEventAt ?? 0) > ($1.session.lastEventAt ?? 0) }
    }

    static func muteUntil() -> Date? {
        guard let data = try? Data(contentsOf: muteURL),
              let parsed = try? JSONDecoder().decode(MuteFile.self, from: data),
              let until = parsed.until, until / 1000 > Date().timeIntervalSince1970 else { return nil }
        return Date(timeIntervalSince1970: until / 1000)
    }

    static func mute(minutes: Double) {
        let until = (Date().timeIntervalSince1970 + minutes * 60) * 1000
        if let data = try? JSONEncoder().encode(MuteFile(until: until)) {
            try? data.write(to: muteURL)
        }
    }

    static func unmute() {
        try? FileManager.default.removeItem(at: muteURL)
    }
}

// MARK: - Menu-bar app

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private let engine = HotkeyEngine.shared
    private var refreshTimer: Timer?
    private var lastSnapshot = ""

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        engine.onStateChange = { [weak self] in self?.rebuildMenu() }

        // Start automatically if we already have permission. Never nag on launch.
        if engine.hasPermission() {
            engine.start()
        }
        rebuildMenu()

        // Poll the roster files; rebuild only when their content changes.
        // ponytail: 2s polling over FSEvents — the files are tiny and infrequent.
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.refreshIfChanged()
        }
    }

    private func refreshIfChanged() {
        let snapshot = snapshotString()
        if snapshot != lastSnapshot {
            rebuildMenu()
        }
    }

    private func snapshotString() -> String {
        let sessions = AgentStore.readSessions()
            .map { "\($0.key):\($0.session.state ?? "?"):\(Int($0.session.lastEventAt ?? 0 / 60000))" }
            .joined(separator: ",")
        let mute = AgentStore.muteUntil()?.timeIntervalSince1970 ?? 0
        return "\(sessions)|\(mute)|\(engine.isListening)"
    }

    private func timeAgo(_ epochMs: Double?) -> String {
        guard let ms = epochMs else { return "" }
        let minutes = Int(max(0, Date().timeIntervalSince1970 - ms / 1000) / 60)
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes)m" }
        return "\(minutes / 60)h \(minutes % 60)m"
    }

    private func truncated(_ text: String) -> String {
        guard text.count > 38 else { return text }
        return "\(text.prefix(18))…\(text.suffix(18))"
    }

    private func sectionHeader(_ title: String) -> NSMenuItem {
        if #available(macOS 14.0, *) {
            return NSMenuItem.sectionHeader(title: title)
        }
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func sessionItem(_ session: AgentSession, symbol: String, stateLabel: String) -> NSMenuItem {
        let title = "\(truncated(session.label ?? "unknown")) — \(stateLabel) · \(timeAgo(session.lastEventAt))"
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false // informational rows; state is carried by text + symbol, never color alone
        item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: stateLabel)
        return item
    }

    private func rebuildMenu() {
        lastSnapshot = snapshotString()
        let sessions = AgentStore.readSessions()
        let needsYou = sessions.filter { $0.session.state == "needs_input" }
        let working = sessions.filter { $0.session.state == "working" }
        let done = sessions.filter { $0.session.state == "done" }.prefix(5)
        let muteUntil = AgentStore.muteUntil()

        // Menu-bar title: quiet by default; the needs-you count is the one
        // signal important enough to surface without opening the menu.
        var title = engine.isListening ? "6·7" : "6·7 ⏸"
        if !needsYou.isEmpty { title += " (\(needsYou.count))" }
        statusItem.button?.title = title

        let menu = NSMenu()
        menu.delegate = self

        // Content first: the roster. Chrome (app controls) defers to the bottom.
        if sessions.isEmpty {
            let empty = NSMenuItem(title: "No agent sessions yet", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
            let hint = NSMenuItem(title: "Sounds are wired — start a Claude Code or Codex run.", action: nil, keyEquivalent: "")
            hint.isEnabled = false
            menu.addItem(hint)
        } else {
            if !needsYou.isEmpty {
                menu.addItem(sectionHeader("Needs You"))
                for entry in needsYou {
                    menu.addItem(sessionItem(entry.session, symbol: "exclamationmark.circle.fill", stateLabel: "waiting for you"))
                }
            }
            if !working.isEmpty {
                menu.addItem(sectionHeader("Working"))
                for entry in working {
                    menu.addItem(sessionItem(entry.session, symbol: "circle.dotted", stateLabel: "working"))
                }
            }
            if !done.isEmpty {
                menu.addItem(sectionHeader("Done"))
                for entry in done {
                    menu.addItem(sessionItem(entry.session, symbol: "checkmark.circle", stateLabel: "done"))
                }
            }
        }

        menu.addItem(.separator())

        // The one primary action for this region: silence agent sounds.
        if let muteUntil = muteUntil {
            let formatter = DateFormatter()
            formatter.timeStyle = .short
            let unmute = NSMenuItem(title: "Unmute (muted until \(formatter.string(from: muteUntil)))",
                                    action: #selector(unmuteAgents), keyEquivalent: "")
            unmute.target = self
            unmute.image = NSImage(systemSymbolName: "speaker.slash", accessibilityDescription: "muted")
            menu.addItem(unmute)
        } else {
            let mute = NSMenuItem(title: "Mute Agent Sounds for 1 Hour", action: #selector(muteAgents), keyEquivalent: "m")
            mute.target = self
            mute.image = NSImage(systemSymbolName: "speaker.slash", accessibilityDescription: "mute")
            menu.addItem(mute)
        }

        menu.addItem(.separator())

        let toggle = NSMenuItem(
            title: engine.isListening ? "Hotkey 6→7: On" : "Hotkey 6→7: Off",
            action: #selector(toggleListening),
            keyEquivalent: ""
        )
        toggle.target = self
        toggle.state = engine.isListening ? .on : .off
        menu.addItem(toggle)

        if !engine.hasPermission() {
            let grant = NSMenuItem(title: "Grant Input Monitoring…", action: #selector(grantPermission), keyEquivalent: "")
            grant.target = self
            menu.addItem(grant)
        }

        let test = NSMenuItem(title: "Test Hotkey Sound", action: #selector(testSound), keyEquivalent: "")
        test.target = self
        menu.addItem(test)

        let login = NSMenuItem(title: "Launch at Login", action: #selector(toggleLogin), keyEquivalent: "")
        login.target = self
        login.state = (SMAppService.mainApp.status == .enabled) ? .on : .off
        menu.addItem(login)

        menu.addItem(.separator())

        let quit = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        statusItem.menu = menu
    }

    func menuWillOpen(_ menu: NSMenu) {
        refreshIfChanged()
    }

    @objc private func muteAgents() {
        AgentStore.mute(minutes: 60)
        rebuildMenu()
    }

    @objc private func unmuteAgents() {
        AgentStore.unmute()
        rebuildMenu()
    }

    @objc private func toggleListening() {
        if engine.isListening {
            engine.stop()
        } else if engine.hasPermission() {
            engine.start()
        } else {
            grantPermission()
        }
    }

    @objc private func grantPermission() {
        engine.requestPermission()
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func testSound() {
        engine.playSound()
    }

    @objc private func toggleLogin() {
        if SMAppService.mainApp.status == .enabled {
            try? SMAppService.mainApp.unregister()
        } else {
            try? SMAppService.mainApp.register()
        }
        rebuildMenu()
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // menu-bar only, no Dock icon
app.run()
