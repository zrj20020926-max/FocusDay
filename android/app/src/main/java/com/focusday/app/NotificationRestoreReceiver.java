package com.focusday.app;

import android.content.Context;
import android.content.Intent;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationRestoreReceiver;
import com.capacitorjs.plugins.localnotifications.LocalNotificationSchedule;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;

import java.util.Date;

public class NotificationRestoreReceiver extends LocalNotificationRestoreReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        // Keep future alarms. Past timer boundaries are recovered by TimerService
        // when the app opens, without replaying outdated lock-screen messages.
        NotificationStorage storage = new NotificationStorage(context);
        long now = System.currentTimeMillis();
        for (String id : storage.getSavedNotificationIds()) {
            LocalNotification notification = storage.getSavedNotification(id);
            if (notification == null || notification.getExtra() == null
                || !"focus-day".equals(notification.getExtra().optString("source"))) continue;
            LocalNotificationSchedule schedule = notification.getSchedule();
            Date at = schedule == null ? null : schedule.getAt();
            if (at != null && at.getTime() <= now) storage.deleteNotification(id);
        }
        super.onReceive(context, intent);
    }
}
