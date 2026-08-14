---
title: Notifications
---

## Notification types

- **Push** — browser push notifications, on by default. Delivery is handled by the server as soon as a message lands, so it works even if the sender closes the app right after sending.
- **In-app badge** — an unread badge in the app, on by default
- **Home-screen badge** — when the app is installed, the icon on your home screen shows your total unread count. Supported on iOS 16.4+ and desktop; it updates even when the app is closed. On Android the badge is handled by the OS and only shows a dot while a notification is active.
- **Email** — off by default
- **"It's your turn"** — a distinct notification when you are the active player

## Permission banner

On first load you may see a banner asking to enable push notifications. Accept it to stay in the loop when you're away.

## iOS support

On iOS, push notifications require **installing the app to your Home Screen** — iOS only exposes the Push API inside installed web apps. The UI shows install guidance and disables push controls until the app is installed. For the home-screen badge to show, **Badges** must be enabled under iOS Settings → Notifications → the app.

## Per-channel settings

Each member controls which notifications they receive for each channel, from the **Notifications** item in the channel sidebar:

- All new messages
- GM messages only
- "It's your turn" alerts
