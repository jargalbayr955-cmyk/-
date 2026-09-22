package mn.achilt.driver;

import org.junit.Test;
import static org.junit.Assert.*;

public class WorkPolicyTest {
    private final String origin = "https://driver.example";
    @Test public void embeddedBrowserOnlyTrustsExactHttpsOrigin() {
        assertTrue(WorkPolicy.trusted(origin, origin + "/driver"));
        assertTrue(WorkPolicy.trusted(origin, origin + ":443/driver"));
        for (String value : new String[]{"http://driver.example/driver", "https://driver.example.evil.test", "https://evil.test@driver.example", "https://driver.example:8443", "javascript:alert(1)", "intent://driver.example", "file:///data/private"})
            assertFalse(value, WorkPolicy.trusted(origin, value));
    }
    @Test public void staleOrImpreciseGpsMustNotRenewAvailability() {
        assertTrue(WorkPolicy.freshLocation(20_000, 25, 47.9, 106.9));
        assertTrue(WorkPolicy.freshLocation(60_000, 150, 0, 0));
        assertFalse(WorkPolicy.freshLocation(60_001, 25, 47.9, 106.9));
        assertFalse(WorkPolicy.freshLocation(-1, 25, 47.9, 106.9));
        assertFalse(WorkPolicy.freshLocation(0, 151, 47.9, 106.9));
        assertFalse(WorkPolicy.freshLocation(0, 0, 47.9, 106.9));
        assertFalse(WorkPolicy.freshLocation(0, Float.NaN, 47.9, 106.9));
        assertFalse(WorkPolicy.freshLocation(0, 20, Double.NaN, 106.9));
        assertFalse(WorkPolicy.freshLocation(0, 20, 91, 106.9));
    }
    @Test public void acceptedWorkContinuesButRestAndPaymentStopTracking() {
        assertTrue(WorkPolicy.keepWorking(true, false, false));
        assertTrue(WorkPolicy.keepWorking(false, true, false));
        assertFalse(WorkPolicy.keepWorking(false, false, false));
        assertFalse(WorkPolicy.keepWorking(true, true, true));
    }
    @Test public void nativeTransportNeverForwardsOtherRoleCookies() {
        assertEquals("", WorkPolicy.driverCookie(null));
        assertEquals("", WorkPolicy.driverCookie("achilt_driver_session="));
        assertEquals("", WorkPolicy.driverCookie("other_achilt_driver_session=bad"));
        assertEquals("achilt_driver_session=driver-token", WorkPolicy.driverCookie("achilt_admin_session=private; achilt_driver_session=driver-token; achilt_customer_session=private"));
    }
}
