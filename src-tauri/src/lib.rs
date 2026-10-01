use serde::Serialize;

#[derive(Serialize)]
pub struct UrlMetadata {
    pub title: String,
    pub favicon: String,
    pub description: String,
    pub image: String,
}

#[tauri::command]
async fn fetch_url_preview(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let body = resp.text().await.map_err(|e| e.to_string())?;

    let parsed_url = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let base_tag = format!("<base href=\"{}/\"><meta charset=\"UTF-8\">", parsed_url);

    let re_script = regex::Regex::new(r"(?is)<script\b[^>]*>.*?</script>").unwrap();
    let cleaned = re_script.replace_all(&body, "");

    let re_head = regex::Regex::new(r"(?i)<head[^>]*>").unwrap();
    let result = if re_head.is_match(&cleaned) {
        re_head.replace(&cleaned, format!("$0\n{}", base_tag)).to_string()
    } else {
        format!("{}\n{}", base_tag, cleaned)
    };

    Ok(result)
}

#[tauri::command]
async fn fetch_url_metadata(url: String) -> Result<UrlMetadata, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(8))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let body = resp.text().await.map_err(|e| e.to_string())?;

    let parsed_url = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let default_favicon = format!("{}://{}/favicon.ico", parsed_url.scheme(), parsed_url.host_str().unwrap_or(""));

    let re_title = regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap();
    let title = re_title.captures(&body)
        .map(|c| c[1].trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| url.clone());

    let re_desc = regex::Regex::new(r#"(?is)<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']"#).unwrap();
    let description = re_desc.captures(&body)
        .map(|c| c[1].trim().to_string())
        .unwrap_or_default();

    let re_img = regex::Regex::new(r#"(?is)<meta\s+[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']*)["']"#).unwrap();
    let image = re_img.captures(&body)
        .map(|c| c[1].trim().to_string())
        .unwrap_or_default();

    let re_fav = regex::Regex::new(r#"(?is)<link\s+[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']*)["']"#).unwrap();
    let favicon = re_fav.captures(&body)
        .and_then(|c| {
            let href = c[1].trim();
            if href.starts_with("http") {
                Some(href.to_string())
            } else if href.starts_with("//") {
                Some(format!("{}:{}", parsed_url.scheme(), href))
            } else if let Ok(joined) = parsed_url.join(href) {
                Some(joined.to_string())
            } else {
                None
            }
        })
        .unwrap_or(default_favicon);

    Ok(UrlMetadata {
        title,
        favicon,
        description,
        image,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![fetch_url_preview, fetch_url_metadata])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
