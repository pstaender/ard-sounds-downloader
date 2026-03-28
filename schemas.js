import { gql } from "graphql-request";

export const audioPodcast = gql`
  query ProgramSetEpisodesQuery($id: ID!, $offset: Int!, $count: Int!) {
    result: programSet(id: $id) {
      items(
        offset: $offset
        first: $count
        filter: {
          isPublished: { equalTo: true }
          itemType: { notEqualTo: EVENT_LIVESTREAM }
        }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          coreType
          coreId
          assetId
          title
          isPublished
          tracking
          publishDate
          summary
          duration
          path
          image {
            url
            url1X1
            description
            attribution
          }
          programSet {
            id
            coreId
            title
            path
            publicationService {
              title
              genre
              path
              organizationName
            }
          }
          audios {
            url
            mimeType
            downloadUrl
            allowDownload
          }
        }
      }
    }
  }
`;
