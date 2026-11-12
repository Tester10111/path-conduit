Path Conduit
============

A small offline tool that groups a Fluke / LinkWare XML export by Path-Conduit
and A0X.

Nothing is saved. Closing clears everything. Files, checkmarks, and seen-record
history live only in memory for this session.

Run the Windows app
-------------------
1. Double-click PathConduit.exe. No installer and no admin rights are needed.
2. If Windows SmartScreen appears, click More info, then Run anyway. The
   build is unsigned, which is why that prompt shows up.
3. The app uses the WebView2 runtime included with Windows 10/11. On a rare
   older PC, install Microsoft's Evergreen WebView2 Runtime.

Or open PathConduit.html in Microsoft Edge. It works with no network
connection.

Daily use
---------
Drop an XML file or click Open. Keep the window open if a later file will
add more records (for example 300 in the morning and the full 500 later).
New rows are highlighted. "Mark all as seen" clears the new badges. "Clear"
starts a fresh session. A CSV or print is written only when you ask for it.

Privacy
-------
Fully offline. No network, no accounts, no telemetry. Closing the app or
the browser tab forgets everything.
