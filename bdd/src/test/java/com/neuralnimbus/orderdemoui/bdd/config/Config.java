package com.neuralnimbus.orderdemoui.bdd.config;

/**
 * UI base-URL resolution, matching the one-shared-ConfigReader pattern of the
 * sibling suites in this repo.
 *
 * Resolution order (first non-blank wins):
 *   1. -Dui.base.url system property
 *   2. E2E_BASE_URL environment variable (the name the cypress/selenium/... tools
 *      in this repo already use)
 *   3. the in-cluster default from k8s/order-demo-ui.yaml (order-demo namespace)
 *
 * The app is assumed to be ALREADY RUNNING at the resolved URL — this suite
 * never starts it. For a local run, port-forward the UI:
 *   kubectl -n order-demo port-forward svc/order-demo-ui 3000:3000
 * and override to http://localhost:3000.
 */
public final class Config {

    private Config() {
    }

    public static String baseUrl() {
        return resolve("ui.base.url", "E2E_BASE_URL",
                "http://order-demo-ui.order-demo.svc.cluster.local:3000");
    }

    static String resolve(String sysProp, String envVar, String defaultUrl) {
        String value = System.getProperty(sysProp);
        if (isBlank(value)) {
            value = System.getenv(envVar);
        }
        if (isBlank(value)) {
            value = defaultUrl;
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
