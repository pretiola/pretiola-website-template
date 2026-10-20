use crate::config::SiteConfig;
use actix_web::{web, HttpResponse, Responder};
use chrono::{Datelike, Utc};
use tera::Tera;

pub async fn index(tera: web::Data<Tera>, config: web::Data<SiteConfig>) -> impl Responder {
    render_page("index", &tera, &config)
}

pub async fn dynamic_page(
    path: web::Path<String>,
    tera: web::Data<Tera>,
    config: web::Data<SiteConfig>,
) -> impl Responder {
    render_page(&path.into_inner(), &tera, &config)
}

fn render_page(page: &str, tera: &Tera, config: &SiteConfig) -> HttpResponse {
    let template_name = format!("{}.html", page);
    if !is_public_template(&template_name) || tera.get_template(&template_name).is_err() {
        return HttpResponse::NotFound().body("Page not found");
    }

    // Keep / and /index.html on the same rendering path as every content page.
    let mut context = tera::Context::new();
    context.insert("page_name", page);
    context.insert("current_year", &Utc::now().year());
    context.insert("site_url", &config.site_url);
    context.insert("canonical_url", &config.page_url(page));
    context.insert("buttondown_username", &config.buttondown_username);

    match tera.render(&template_name, &context) {
        Ok(html) => HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(html),
        Err(e) => {
            log::error!("Template rendering error for {}: {}", template_name, e);
            HttpResponse::InternalServerError().body("Error rendering page")
        }
    }
}

const PARTIALS: &[&str] = &["navbar.html", "footer.html"];

/// Content pages have a top-level filename; reusable fragments belong in
/// templates/partials/ or use a leading underscore.
fn is_public_template(name: &str) -> bool {
    let Some(page) = name.strip_suffix(".html") else {
        return false;
    };
    !page.is_empty()
        && !page.starts_with('_')
        && !PARTIALS.contains(&name)
        && page
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

pub async fn sitemap(tera: web::Data<Tera>, config: web::Data<SiteConfig>) -> impl Responder {
    let mut urls = vec![format!("  <url><loc>{}/</loc></url>", config.site_url)];
    let mut template_names: Vec<&str> = tera
        .get_template_names()
        .filter(|name| is_public_template(name) && *name != "index.html")
        .collect();
    template_names.sort();

    for name in template_names {
        urls.push(format!(
            "  <url><loc>{}/{}</loc></url>",
            config.site_url, name
        ));
    }

    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{}\n</urlset>\n",
        urls.join("\n")
    );
    HttpResponse::Ok()
        .content_type("application/xml; charset=utf-8")
        .body(xml)
}

pub async fn robots(config: web::Data<SiteConfig>) -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body(format!(
            "User-agent: *\nDisallow:\n\nSitemap: {}/sitemap.xml\n",
            config.site_url
        ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_page_slugs_are_rendered() {
        assert!(is_public_template("my_page-2.html"));
        for name in [
            "navbar.html",
            "footer.html",
            "_helper.html",
            "partials/privacy.html",
            "../index.html",
            "a&b.html",
            ".html",
        ] {
            assert!(!is_public_template(name), "{name}");
        }
    }

    #[actix_web::test]
    async fn missing_pages_and_broken_pages_have_distinct_statuses() {
        let mut tera = Tera::default();
        tera.add_raw_template("broken.html", "{{ missing_required_context }}")
            .unwrap();
        let config = SiteConfig::default();
        assert_eq!(render_page("absent", &tera, &config).status(), 404);
        assert_eq!(render_page("broken", &tera, &config).status(), 500);
    }
}
