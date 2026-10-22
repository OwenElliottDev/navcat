// Resources: what the server covers, the place categories, and a place's details, for apps to
// put in front of the model. Each is the same answer as its tool.

use rmcp::ErrorData;
use rmcp::model::{ReadResourceResult, Resource, ResourceContents, ResourceTemplate};
use serde::Serialize;

use crate::browse;
use crate::capabilities;
use crate::stack::Stack;
use crate::upstream::Error;

const CAPABILITIES: &str = "navcat://capabilities";
const CATEGORIES: &str = "navcat://categories";
const PLACES: &str = "navcat://places/";
const JSON: &str = "application/json";

pub fn list() -> Vec<Resource> {
    vec![
        Resource::new(CAPABILITIES, "capabilities")
            .with_title("What Nav Cat covers")
            .with_description(
                "The area, travel modes and route options, and the public transport timetables' \
                modes and dates",
            )
            .with_mime_type(JSON),
        Resource::new(CATEGORIES, "categories")
            .with_title("Place categories")
            .with_description("The kinds of place find_nearby and reachable look for")
            .with_mime_type(JSON),
    ]
}

pub fn templates() -> Vec<ResourceTemplate> {
    vec![
        ResourceTemplate::new(format!("{PLACES}{{type}}/{{id}}"), "place")
            .with_title("Place details")
            .with_description(
                "A place's details by its id from search (type N, W, R, U or O), with all its \
                tags such as opening_hours",
            )
            .with_mime_type(JSON),
    ]
}

pub async fn read(stack: &Stack, uri: &str) -> Result<ReadResourceResult, ErrorData> {
    let text = if uri == CAPABILITIES {
        json(capabilities::capabilities(stack).await)?
    } else if uri == CATEGORIES {
        json(browse::categories(stack).await)?
    } else if let Some(id) = uri.strip_prefix(PLACES) {
        json(browse::get_place(stack, id).await)?
    } else {
        return Err(ErrorData::resource_not_found(
            format!("No resource {uri}"),
            None,
        ));
    };
    let contents = ResourceContents::TextResourceContents {
        uri: uri.into(),
        mime_type: Some(JSON.into()),
        text,
        meta: None,
    };
    Ok(ReadResourceResult::new(vec![contents]))
}

fn json<T: Serialize>(found: Result<T, Error>) -> Result<String, ErrorData> {
    match found {
        Ok(value) => serde_json::to_string(&value)
            .map_err(|err| ErrorData::internal_error(err.to_string(), None)),
        Err(error @ (Error::Invalid { .. } | Error::Rejected(..))) => {
            Err(ErrorData::resource_not_found(error.to_string(), None))
        }
        Err(error) => Err(ErrorData::internal_error(error.to_string(), None)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    #[test]
    fn lists_resources() {
        let uris: Vec<String> = list().into_iter().map(|r| r.uri).collect();
        assert_eq!(uris, [CAPABILITIES, CATEGORIES]);
        assert_eq!(templates()[0].uri_template, "navcat://places/{type}/{id}");
    }

    // Turned down before asking any service
    #[tokio::test]
    async fn rejects_unknown_resources() {
        let stack = Stack::new(&Config::from_env().unwrap());
        assert!(read(&stack, "navcat://nothing").await.is_err());
        assert!(read(&stack, "navcat://places/X/1").await.is_err());
    }
}
