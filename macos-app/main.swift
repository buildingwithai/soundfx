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

// MARK: - Menu-bar app

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let engine = HotkeyEngine.shared

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        engine.onStateChange = { [weak self] in self?.rebuildMenu() }

        // Start automatically if we already have permission. Never nag on launch.
        if engine.hasPermission() {
            engine.start()
        }
        rebuildMenu()
    }

    private func rebuildMenu() {
        statusItem.button?.title = engine.isListening ? "6·7" : "6·7 ⏸"

        let menu = NSMenu()

        let toggle = NSMenuItem(
            title: engine.isListening ? "Listening: On" : "Listening: Off",
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

        let test = NSMenuItem(title: "Test sound", action: #selector(testSound), keyEquivalent: "")
        test.target = self
        menu.addItem(test)

        menu.addItem(.separator())

        let login = NSMenuItem(title: "Launch at login", action: #selector(toggleLogin), keyEquivalent: "")
        login.target = self
        login.state = (SMAppService.mainApp.status == .enabled) ? .on : .off
        menu.addItem(login)

        menu.addItem(.separator())

        let quit = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        statusItem.menu = menu
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
