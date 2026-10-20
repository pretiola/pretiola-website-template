use std::{env, io};
use url::Url;

/// Public site settings shared by page rendering and discovery endpoints.
#[derive(Clone, Debug)]
pub struct SiteConfig {
    pub site_url: String,
    pub buttondown_username: String,
}

impl SiteConfig {
    pub fn new(site_url: &str, buttondown_username: &str) -> io::Result<Self> {
        let url =
            Url::parse(site_url).map_err(|_| invalid("SITE_URL must be an HTTP(S) origin"))?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(invalid(
                "SITE_URL must be an HTTP(S) origin without credentials, a path, query, or fragment",
            ));
        }
        if !buttondown_username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        {
            return Err(invalid(
                "BUTTONDOWN_USERNAME may contain only letters, numbers, underscores, and hyphens",
            ));
        }

        Ok(Self {
            site_url: url.as_str().trim_end_matches('/').to_owned(),
            buttondown_username: buttondown_username.to_owned(),
        })
    }

    pub fn from_env() -> io::Result<Self> {
        Self::new(
            &setting("SITE_URL", "https://example.com")?,
            &setting("BUTTONDOWN_USERNAME", "")?,
        )
    }

    pub fn page_url(&self, page: &str) -> String {
        if page == "index" {
            format!("{}/", self.site_url)
        } else {
            format!("{}/{}.html", self.site_url, page)
        }
    }
}

impl Default for SiteConfig {
    fn default() -> Self {
        Self::new("https://example.com", "").expect("Default site settings are valid")
    }
}

fn setting(name: &str, default: &str) -> io::Result<String> {
    match env::var(name) {
        Ok(value) => Ok(value),
        Err(env::VarError::NotPresent) => Ok(default.to_owned()),
        Err(env::VarError::NotUnicode(_)) => Err(invalid(&format!("{name} must be valid UTF-8"))),
    }
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

#[cfg(test)]
mod tests {
    use super::SiteConfig;

    #[test]
    fn normalizes_origin_and_home_alias() {
        let config = SiteConfig::new("https://MY-SITE.example/", "my_newsletter-2").unwrap();
        assert_eq!(config.site_url, "https://my-site.example");
        assert_eq!(config.page_url("index"), "https://my-site.example/");
        assert_eq!(
            config.page_url("privacy"),
            "https://my-site.example/privacy.html"
        );
        assert_eq!(config.buttondown_username, "my_newsletter-2");
        assert!(SiteConfig::default().buttondown_username.is_empty());
        assert!(SiteConfig::new("http://localhost:8080", "").is_ok());
    }

    #[test]
    fn rejects_origins_that_cannot_match_the_root_mounted_site() {
        for origin in [
            "javascript:alert(1)",
            "ftp://example.com",
            "https://user:password@example.com",
            "https://example.com/subdir",
            "https://example.com/?x=1",
            "https://example.com/#section",
            "/relative",
        ] {
            assert!(SiteConfig::new(origin, "").is_err(), "{origin}");
        }
    }

    #[test]
    fn rejects_invalid_newsletter_destinations() {
        for username in [
            "../other",
            "https://example.com",
            "name?x=1",
            "has space",
            "a/b",
        ] {
            assert!(
                SiteConfig::new("https://example.com", username).is_err(),
                "{username}"
            );
        }
    }
}
