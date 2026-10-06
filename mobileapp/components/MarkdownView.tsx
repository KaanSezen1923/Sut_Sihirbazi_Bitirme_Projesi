import { StyleSheet, Text, View, ScrollView, Platform } from 'react-native';

interface MarkdownViewProps {
  children?: string;
  style?: any;
}

export function MarkdownView({ children = '', style }: MarkdownViewProps) {
  if (!children) return null;

  const lines = children.split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;
  let keyIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Tablo Kontrolü (| ile başlayıp biten satırlar)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        // İlk satır header
        const headerCells = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        // Ayırıcı satır (|---|---|) atla
        const rowStartIndex = tableLines[1].replace(/[-| :]/g, '').length === 0 ? 2 : 1;

        const rows = tableLines.slice(rowStartIndex).map((rowLine) =>
          rowLine
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );

        elements.push(
          <ScrollView
            key={`table-${keyIdx++}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tableScrollView}
            contentContainerStyle={styles.tableContent}
          >
            <View style={styles.tableCard}>
              <View style={[styles.tr, styles.thRow]}>
                {headerCells.map((h, hIdx) => (
                  <View key={`th-${hIdx}`} style={styles.th}>
                    <Text style={styles.thText}>{h}</Text>
                  </View>
                ))}
              </View>
              {rows.map((row, rIdx) => (
                <View
                  key={`tr-${rIdx}`}
                  style={[styles.tr, rIdx === rows.length - 1 ? styles.lastTr : null]}
                >
                  {row.map((cell, cIdx) => (
                    <View key={`td-${cIdx}`} style={styles.td}>
                      <Text style={styles.tdText}>{renderInlineText(cell)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
        continue;
      }
    }

    // 2. Başlıklar (# Header)
    if (trimmed.startsWith('### ')) {
      elements.push(
        <Text key={`h3-${keyIdx++}`} style={styles.h3}>
          {renderInlineText(trimmed.replace(/^###\s+/, ''))}
        </Text>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <Text key={`h2-${keyIdx++}`} style={styles.h2}>
          {renderInlineText(trimmed.replace(/^##\s+/, ''))}
        </Text>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <Text key={`h1-${keyIdx++}`} style={styles.h1}>
          {renderInlineText(trimmed.replace(/^#\s+/, ''))}
        </Text>
      );
      i++;
      continue;
    }

    // 3. Liste Öğeleri (* veya -)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[-*]\s+/, '');
      elements.push(
        <View key={`li-${keyIdx++}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInlineText(itemText)}</Text>
        </View>
      );
      i++;
      continue;
    }

    // 4. Numaralı Liste (1. 2.)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(
        <View key={`num-${keyIdx++}`} style={styles.bulletRow}>
          <Text style={styles.numDot}>{numMatch[1]}.</Text>
          <Text style={styles.bulletText}>{renderInlineText(numMatch[2])}</Text>
        </View>
      );
      i++;
      continue;
    }

    // 5. Boş satır
    if (trimmed === '') {
      elements.push(<View key={`space-${keyIdx++}`} style={styles.emptyLine} />);
      i++;
      continue;
    }

    // 6. Normal Paragraf
    elements.push(
      <Text key={`p-${keyIdx++}`} style={[styles.paragraph, style]}>
        {renderInlineText(line)}
      </Text>
    );
    i++;
  }

  return <View style={styles.container}>{elements}</View>;
}

// Inline metinlerde **kalın**, *italik* ve `kod` render etme
function renderInlineText(text: string): React.ReactNode {
  if (!text) return '';
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <Text key={index} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <Text key={index} style={styles.italic}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <Text key={index} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#263238',
    marginBottom: 6,
  },
  bold: {
    fontWeight: '700',
    color: '#1B5E20',
  },
  italic: {
    fontStyle: 'italic',
  },
  inlineCode: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  h1: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginTop: 8,
    marginBottom: 6,
  },
  h2: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 6,
    marginBottom: 4,
  },
  h3: {
    fontSize: 15,
    fontWeight: '600',
    color: '#388E3C',
    marginTop: 4,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 16,
    color: '#2E7D32',
    marginRight: 6,
    lineHeight: 22,
  },
  numDot: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginRight: 6,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#263238',
  },
  emptyLine: {
    height: 6,
  },
  tableScrollView: {
    marginVertical: 8,
  },
  tableContent: {
    paddingRight: 8,
  },
  tableCard: {
    borderWidth: 1,
    borderColor: '#C5E1A5',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    minWidth: 320,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#F1F8E9',
  },
  lastTr: {
    borderBottomWidth: 0,
  },
  thRow: {
    backgroundColor: '#E8F5E9',
  },
  th: {
    padding: 10,
    borderRightWidth: 1,
    borderColor: '#C5E1A5',
    minWidth: 100,
    justifyContent: 'center',
  },
  thText: {
    fontWeight: '700',
    fontSize: 13,
    color: '#1B5E20',
  },
  td: {
    padding: 10,
    borderRightWidth: 1,
    borderColor: '#F1F8E9',
    minWidth: 100,
    justifyContent: 'center',
  },
  tdText: {
    fontSize: 13,
    color: '#37474F',
  },
});
