package com.focusday.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class NativeConfigurationTest {

    @Test
    public void registersOnlyTheExpectedAccountDeepLink() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.focusday.app", appContext.getPackageName());
        assertNotNull(resolveLink(appContext, "com.focusday.app://auth/account?error=access_denied"));
        assertNull(resolveLink(appContext, "com.focusday.app://auth/tasks"));
    }

    private ResolveInfo resolveLink(Context context, String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(context.getPackageName());
        return context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
    }
}
