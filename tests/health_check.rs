use actix_web::rt::spawn;
use pretiola::{config::SiteConfig, startup::run_with_config};
use std::net::TcpListener;

fn spawn_app() -> String {
    spawn_app_with_config(SiteConfig::default())
}

fn spawn_app_with_config(config: SiteConfig) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind random port");
    let port = listener.local_addr().unwrap().port();
    let server = run_with_config(listener, config).expect("Failed to bind address");
    drop(spawn(server));
    format!("http://127.0.0.1:{}", port)
}

#[actix_web::test]
async fn health_check_works() {
    let address = spawn_app();
    let client = reqwest::Client::new();

    let response = client
        .get(format!("{address}/"))
        .send()
        .await
        .expect("Failed to execute request.");

    assert!(response.status().is_success());
    let body = response.text().await.expect("Failed to get body");
    assert!(body.contains("Welcome to My Site"));
    assert!(body.contains("Home"));
    assert!(body.contains("Getting Started"));
}

#[actix_web::test]
async fn all_pages_return_200() {
    let address = spawn_app();
    let client = reqwest::Client::new();

    let pages = ["/", "/index.html", "/terms.html", "/privacy.html"];

    for page in pages {
        let response = client
            .get(format!("{address}{page}"))
            .send()
            .await
            .unwrap_or_else(|_| panic!("Failed to request {}", page));
        assert!(
            response.status().is_success(),
            "Page {} returned {}",
            page,
            response.status()
        );
    }
}

#[actix_web::test]
async fn nonexistent_page_returns_404() {
    let address = spawn_app();
    let client = reqwest::Client::new();

    let response = client
        .get(format!("{address}/nonexistent.html"))
        .send()
        .await
        .expect("Failed to execute request.");

    assert_eq!(response.status(), 404);
}

#[actix_web::test]
async fn sitemap_returns_valid_xml() {
    let address = spawn_app();
    let client = reqwest::Client::new();

    let response = client
        .get(format!("{address}/sitemap.xml"))
        .send()
        .await
        .expect("Failed to execute request.");

    assert!(response.status().is_success());
    let content_type = response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(content_type.contains("xml"));

    let body = response.text().await.expect("Failed to get body");
    assert!(body.contains("<urlset"));
    assert!(body.contains("example.com"));
    // Should include content pages
    assert!(body.contains("<loc>https://example.com/</loc>"));
    assert!(!body.contains("index.html"));
    assert!(body.contains("terms.html"));
    assert!(body.contains("privacy.html"));
    // Should NOT include partials
    assert!(!body.contains("navbar.html"));
    assert!(!body.contains("footer.html"));
    assert!(!body.contains("partials/"));
}

#[actix_web::test]
async fn head_requests_work() {
    let address = spawn_app();
    let client = reqwest::Client::new();

    let pages = ["/", "/index.html", "/sitemap.xml", "/robots.txt"];

    for page in pages {
        let response = client
            .head(format!("{address}{page}"))
            .send()
            .await
            .unwrap_or_else(|_| panic!("HEAD request failed for {}", page));
        assert!(
            response.status().is_success(),
            "HEAD {} returned {}",
            page,
            response.status()
        );
    }
}

#[actix_web::test]
async fn fragments_are_not_public_pages() {
    let address = spawn_app();
    let client = reqwest::Client::new();
    for page in [
        "/navbar.html",
        "/footer.html",
        "/partials/privacy.html",
        "/partials%2Fprivacy.html",
        "/partials/newsletter.html",
    ] {
        let response = client.get(format!("{address}{page}")).send().await.unwrap();
        assert_eq!(response.status(), 404, "{page}");
    }
}

#[actix_web::test]
async fn discovery_uses_configured_origin_not_request_host() {
    let address = spawn_app_with_config(SiteConfig::new("https://my-site.example/", "").unwrap());
    let client = reqwest::Client::new();
    let sitemap = client
        .get(format!("{address}/sitemap.xml"))
        .header("Host", "untrusted.example")
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(sitemap.contains("<loc>https://my-site.example/</loc>"));
    assert!(sitemap.contains("<loc>https://my-site.example/privacy.html</loc>"));
    assert!(!sitemap.contains("untrusted.example"));
    assert!(!sitemap.contains("https://example.com"));

    let robots = client
        .get(format!("{address}/robots.txt"))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert_eq!(
        robots,
        "User-agent: *\nDisallow:\n\nSitemap: https://my-site.example/sitemap.xml\n"
    );
}

#[actix_web::test]
async fn canonical_urls_and_shared_privacy_controls_render_on_every_page() {
    let address = spawn_app_with_config(SiteConfig::new("https://my-site.example", "").unwrap());
    let client = reqwest::Client::new();
    for (path, canonical) in [
        ("/", "https://my-site.example/"),
        ("/index.html", "https://my-site.example/"),
        ("/privacy.html", "https://my-site.example/privacy.html"),
        ("/terms.html", "https://my-site.example/terms.html"),
    ] {
        let body = client
            .get(format!("{address}{path}"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert!(
            body.contains(&format!(
                "<link rel=\"canonical\" href=\"{}\">",
                tera::escape_html(canonical)
            )),
            "Missing canonical URL for {path}"
        );
        assert!(body.contains("id=\"privacy-dialog\""), "{path}");
        assert!(body.contains("data-privacy-open"), "{path}");
        assert!(
            body.contains("src=\"/js/analytics-config.js\" defer"),
            "{path}"
        );
        assert!(body.contains("src=\"/js/analytics.js\" defer"), "{path}");
        assert!(!body.contains("googletagmanager.com/gtag/js"), "{path}");
        assert!(!body.contains("embed-subscribe/"), "{path}");
    }
}

#[actix_web::test]
async fn configured_newsletter_form_works_without_javascript_on_both_home_urls() {
    let address =
        spawn_app_with_config(SiteConfig::new("https://my-site.example", "my-newsletter").unwrap());
    let client = reqwest::Client::new();
    for path in ["/", "/index.html"] {
        let body = client
            .get(format!("{address}{path}"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert!(body.contains(
            "action=\"https://buttondown.com/api/emails/embed-subscribe/my-newsletter\""
        ));
        assert!(body.contains("method=\"post\""));
        assert!(body.contains("name=\"email\" type=\"email\""));
        assert!(body.contains("type=\"submit\""));
        assert!(!body.contains("onsubmit="));
    }
}
