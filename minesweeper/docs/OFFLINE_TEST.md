# Minesweeper: offline test on an Android phone

Pilot test script for the Port Chalmers PWA workflow. Work through it in order. Tick the boxes and note anything unexpected at the end.

The checks marked **[Android-only]** cover behaviour that the automated tests can only approximate. They are the most important part of this script.

**Automated results do not count as an Android pass.** On desktop Chromium, all 29 automated checks pass for this build. They cover offline launch and play, the upgrade from the deployed v1 build, touch and mouse input in emulation, malformed saved data and text contrast. Only the phone results in this script count as an Android pass.

**What this build changes**, so you know what to look for (cache `minesweeper-v3`):
- A second finger on the board no longer flags a cell or changes the mine counter.
- A held mouse click reveals instead of flagging. Right-click still flags.
- Malformed saved data is repaired one field at a time, and valid scores are kept.
- Light-theme text is a little darker, to meet contrast guidelines.
- Covered cells are a stronger blue with a brighter edge, so they stand out from revealed cells in both themes.
- A press that produces both a long press and a context menu flags only once.
- After an update, the offline cache is rebuilt in full, even if another app's update deleted it earlier. Saved scores and settings are kept.

---

## Before you start

**You need**
- An Android phone with Chrome. Note the version: Chrome ⋮ menu → Settings → About Chrome, or `chrome://version` on the phone.
- The game deployed to GitHub Pages and reachable at `https://deltarun28.github.io/the_port_chalmers_company/minesweeper/`. This build is on `main`, which GitHub Pages serves, so there is no deploy step.
- A way to turn off mobile data and Wi-Fi together (Quick Settings → airplane mode, plus Wi-Fi off).

**Expected names in Chrome.** Menu labels change between Chrome versions. If a name differs, use the closest one: "Install app" may be "Add to Home screen" on older Chrome.

**Record for each run**
- Phone model and Android version
- Chrome version
- Pass or fail for each step, with a short note for any failure

---

## 1. Fresh installation

Start from a clean state. If an earlier version was installed, remove it first.

- [ ] Long-press the Minesweeper icon on the home screen. Choose **Uninstall** (or App info → Uninstall).
- [ ] In Chrome, open the game URL. Go to ⋮ → Settings → Site settings → All sites. Find `deltarun28.github.io`. Choose **Clear & reset**. This removes the old service worker and cache.
- [ ] Close Chrome completely (recents → swipe away).

## 2. Initial online load

- [ ] Open the game URL in Chrome.
- [ ] The board appears, with 81 cells for Beginner.
- [ ] Wait about 10 seconds. This gives the service worker time to install and cache the app.
- [ ] Reload the page once.
- [ ] Open ⋮ and confirm **Install app** (or **Add to Home screen**) is listed. Its presence means the page is installable.

## 3. Install

- [ ] Choose **Install app** and confirm.
- [ ] A Minesweeper icon appears on the home screen. Its icon matches the mine artwork, not a generic globe.
- [ ] Open the icon. The game opens in its own window, with no Chrome address bar.
- [ ] Close it again.

## 4. Switching to flight mode

- [ ] Turn on **airplane mode**.
- [ ] Turn **Wi-Fi off** as well. Some phones leave Wi-Fi on in airplane mode.
- [ ] Sanity check: open Chrome and go to any website. It should fail. If it loads, you are still online and the test is not valid yet.

## 5. Launching the installed game offline

- [ ] Tap the home-screen icon.
- [ ] The board and controls appear without a delay or an error page.
- [ ] The footer reads "Runs fully offline. No ads, no accounts, no data leaves your device."
- [ ] Press the ← Port Chalmers link. **Expected:** it leaves the game and the browser shows its own offline page. This is by design, because the link points outside the game. Note it as expected, not a failure.

## 6. Testing gameplay offline

- [ ] **Left tap** a cell. A region opens (or a number appears). The timer starts at 0:01 or so, not before.
- [ ] Tap several more cells. Numbers and blank regions behave normally.
- [ ] **Flag mode:** tap 🚩 Flag, then tap a hidden cell. It gets a flag. Tap it again to remove the flag. Tap 🚩 Flag again to leave flag mode.
- [ ] **Right-click style flag:** long-press a hidden cell for about half a second.
- [ ] Tap a revealed number whose neighbours have the right number of flags. The remaining neighbours open ("chording").
- [ ] Switch difficulty to Intermediate, then Expert, using the dropdown. The board changes each time.
- [ ] Press 🙂 to start a new board.
- [ ] Win a Beginner game (or lose one, to check the explosion view). A banner appears.
- [ ] **After a win:** every mine shows a flag. The 🚩 counter reads 0. Check this, because it was broken before this branch.
- [ ] **Covered cells stand out.** After a few reveals, covered cells are clearly different from revealed ones. Check in the dark theme, then switch to the light theme (🌙) and check again.

### 6a. Touch behaviour **[Android-only]**

These check the changes made for touch. Chromium's emulation cannot fully test them.

- [ ] **Long press flags once.** Set Beginner. Long-press a hidden cell for about half a second. Exactly one flag appears. It does not appear and then vanish.
- [ ] **Tap after a long press still works.** Immediately tap a different hidden cell. It reveals on the first tap. A tap that does nothing means the touch fix did not take effect.
- [ ] Repeat the long press and tap-after pair three times on different cells.
- [ ] **Long press on a flagged cell** removes the flag only once, not twice.
- [ ] **Expert panning.** Choose Expert. Start a horizontal drag on a cell and move left. The board scrolls, so columns on the right come into view. No cell gets flagged or revealed by the drag.
- [ ] Pan back to the left edge. The board scrolls back.
- [ ] **Intermediate panning.** Choose Intermediate on the phone. Confirm the right-hand column can be reached by panning.
- [ ] **No zoom on the board.** Double-tap a cell. The board does not zoom in, and text is not selected.
- [ ] Pinch on the board. It should not zoom the board. (Pinching outside the board may still zoom the page, which is acceptable.)
- [ ] **Two fingers.** Put one finger on a hidden cell, then a second finger on another hidden cell. Lift both within half a second. Nothing is flagged, and the 🚩 counter does not change. Then tap a hidden cell. It reveals.
- [ ] **Two fingers, then a long press.** Repeat the two-finger touch, then long-press a hidden cell for about half a second with one finger. Exactly one flag appears on that cell.

## 7. Testing saved data

Scores and settings are kept in the browser's local storage on this phone. Nothing is sent anywhere.

- [ ] Note the current best times in the footer (Beginner, Intermediate, Expert).
- [ ] Win a Beginner game. If the time beats the previous best, the banner says "new best time!" and the footer updates.
- [ ] Switch to Expert and flag mode, and switch to the light theme (🌙 button, which becomes ☀️).
- [ ] Close the game fully (recents → swipe away). Reopen it while still offline.
  - [ ] Difficulty is still Expert.
  - [ ] The light theme is still on.
  - [ ] The flag mode button is still active.
  - [ ] The best times are the same as before the close.
- [ ] Switch back to dark theme and Beginner for the rest of the test.

## 8. Closing and reopening the game offline

- [ ] Open, play a few moves, and close. Repeat three times. Each reopen loads and plays.
- [ ] Restart the phone while still in airplane mode. Open the game from the icon. It loads and plays.
- [ ] Open the game from the icon, then press the home button while a game is in progress. Come back. The timer is still counting from the same start, not from zero, and the board is unchanged.

## 9. Testing future application updates

Do this after a later deploy that changes the game. The tester should know what changed.

- [ ] Go back online (turn airplane mode off, Wi-Fi on). Open the installed game.
- [ ] **Expected:** this launch may still show the **old** version. The new service worker is installed in the background. This is by design, and the next launch gets the update. Note what you see.
- [ ] Close the game fully and reopen it, still online.
- [ ] **Expected:** the new version is showing. Check the change you were told about.
- [ ] Turn airplane mode and Wi-Fi off again. Reopen the game. It loads the new version offline.
- [ ] **Optional, requires a desktop computer.** Connect the phone with USB debugging on. In desktop Chrome, open `chrome://inspect`, inspect the game, and look under Application → Cache Storage. Expected: a single cache named `minesweeper-v3` (or whichever version was deployed). The old `minesweeper-v2` should be gone.

## 10. Final checks

- [ ] Nothing in the game looked broken, cropped or misaligned on the phone.
- [ ] The app icon and name are right.
- [ ] Nothing asked for a network connection while in airplane mode.

---

## Results

| Section | Result | Notes |
|---|---|---|
| 1. Fresh install | | |
| 2. Initial online load | | |
| 3. Install | | |
| 4. Flight mode | | |
| 5. Launch offline | | |
| 6. Gameplay | | |
| 6a. Touch [Android-only] | | |
| 7. Saved data | | |
| 8. Close and reopen | | |
| 9. Updates | | |
| 10. Final checks | | |

**Build:** cache `minesweeper-v3`, on `main` · commit: ______________

**Phone:** ______________________ **Android:** ______ **Chrome:** ______

**Anything unexpected:**
</content>
