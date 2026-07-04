package com.neuralnimbus.orderdemoui.bdd.support;

import io.cucumber.java.After;
import io.cucumber.java.Before;

/**
 * Per-scenario browser lifecycle. cucumber-picocontainer injects the same
 * {@link Browser} instance here and into every step class, so the driver
 * started in @Before is the one the steps drive.
 */
public class Hooks {

    private final Browser browser;

    public Hooks(Browser browser) {
        this.browser = browser;
    }

    @Before
    public void startBrowser() {
        browser.start();
    }

    @After
    public void quitBrowser() {
        browser.quit();
    }
}
