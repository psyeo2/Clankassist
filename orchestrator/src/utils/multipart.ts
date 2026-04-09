type MultipartFile = {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
};

const getBoundary = (contentType: string): string => {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] ?? match?.[2];

  if (!boundary) {
    throw new Error("Multipart boundary was not provided.");
  }

  return boundary;
};

export const parseMultipartFile = (body: Buffer, contentType: string): MultipartFile => {
  const boundary = getBoundary(contentType);
  const delimiter = `--${boundary}`;
  const bodyText = body.toString("latin1");
  const parts = bodyText.split(delimiter).slice(1, -1);

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separatorIndex = part.indexOf("\r\n\r\n");

    if (separatorIndex === -1) {
      continue;
    }

    const headersText = part.slice(0, separatorIndex);
    const contentText = part.slice(separatorIndex + 4);
    const disposition = headersText
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-disposition:"));

    if (!disposition) {
      continue;
    }

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const fieldName = nameMatch?.[1];

    if (fieldName !== "file") {
      continue;
    }

    const contentTypeLine = headersText
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-type:"));
    const fileContentType = contentTypeLine?.split(":")[1]?.trim() || "application/octet-stream";

    return {
      fieldName,
      filename: filenameMatch?.[1] || "audio.wav",
      contentType: fileContentType,
      bytes: Buffer.from(contentText, "latin1"),
    };
  }

  throw new Error("Multipart request did not contain a file field.");
};
