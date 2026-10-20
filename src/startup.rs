use crate::config::SiteConfig;
use crate::routes::{dynamic_page, index, robots, sitemap};
use actix_web::dev::Server;
use actix_web::{web, App, HttpServer};
use std::net::TcpListener;
use tera::Tera;

pub fn run(listener: TcpListener) -> Result<Server, std::io::Error> {
    run_with_config(listener, SiteConfig::from_env()?)
}

/// Run with explicit settings, including in tests without changing process-wide environment.
pub fn run_with_config(
    listener: TcpListener,
    config: SiteConfig,
) -> Result<Server, std::io::Error> {
    let tera = Tera::new("templates/**/*.html").map_err(std::io::Error::other)?;

    let tera = web::Data::new(tera);
    let config = web::Data::new(config);

    let server = HttpServer::new(move || {
        App::new()
            .app_data(tera.clone())
            .app_data(config.clone())
            // Configure static files serving from /static
            .service(actix_files::Files::new("/static", "./static"))
            // Additionally map /pictures directly for old HTML references
            .service(actix_files::Files::new("/pictures", "./static/pictures"))
            // Handle main index route
            .service(
                web::resource("/")
                    .route(web::get().to(index))
                    .route(web::head().to(index)),
            )
            // Sitemap XML route
            .service(
                web::resource("/sitemap.xml")
                    .route(web::get().to(sitemap))
                    .route(web::head().to(sitemap)),
            )
            .service(
                web::resource("/robots.txt")
                    .route(web::get().to(robots))
                    .route(web::head().to(robots)),
            )
            // Handle dynamic page routes
            .service(
                web::resource("/{page}.html")
                    .route(web::get().to(dynamic_page))
                    .route(web::head().to(dynamic_page)),
            )
            // Fallback for static items at root level (e.g. /robots.txt)
            .service(actix_files::Files::new("/", "./static"))
    })
    .listen(listener)?
    .run();
    Ok(server)
}
