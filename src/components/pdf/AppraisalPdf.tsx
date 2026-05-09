import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ListItem } from "@/lib/api/lists";

type Props = {
  listName: string;
  items: ListItem[];
  generatedAt: string;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: "#111",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    fontSize: 14,
    fontWeight: "bold",
  },
  headerRight: {
    fontSize: 9,
    color: "#666",
    marginTop: 3,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginBottom: 10,
  },
  listName: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    padding: 5,
    fontWeight: "bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    padding: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  colNo: { width: "6%" },
  colName: { width: "36%" },
  colMedian: { width: "18%", textAlign: "right" },
  colMikomiku: { width: "20%", textAlign: "right" },
  colNote: { width: "20%" },
  totalRow: {
    flexDirection: "row",
    padding: 5,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#333",
    fontWeight: "bold",
  },
  footer: {
    marginTop: 20,
    fontSize: 8,
    color: "#888",
  },
});

function formatYen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function AppraisalPdf({ listName, items, generatedAt }: Props) {
  const completed = items.filter((i) => i.result);
  const total = completed.reduce(
    (s, i) => s + (i.result?.suggestedBuyPrice ?? 0),
    0
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.headerLeft}>買取マクサス 査定書</Text>
          <Text style={styles.headerRight}>発行日: {generatedAt}</Text>
        </View>
        <View style={styles.divider} />

        {/* リスト名 */}
        <Text style={styles.listName}>{listName}</Text>

        {/* テーブルヘッダー */}
        <View style={styles.tableHeader}>
          <Text style={styles.colNo}>No</Text>
          <Text style={styles.colName}>品名</Text>
          <Text style={styles.colMedian}>中央値</Text>
          <Text style={styles.colMikomiku}>見込金額</Text>
          <Text style={styles.colNote}>メモ</Text>
        </View>

        {/* テーブル行 */}
        {completed.map((item, idx) => (
          <View key={item.id} style={styles.tableRow}>
            <Text style={styles.colNo}>{idx + 1}</Text>
            <Text style={styles.colName}>{item.query.keyword}</Text>
            <Text style={styles.colMedian}>
              {formatYen(item.result!.median)}
            </Text>
            <Text style={styles.colMikomiku}>
              {formatYen(item.result!.suggestedBuyPrice)}
            </Text>
            <Text style={styles.colNote}>{item.notes ?? ""}</Text>
          </View>
        ))}

        {/* 合計 */}
        <View style={styles.totalRow}>
          <Text style={[styles.colNo, styles.colName, { width: "60%" }]}>
            合計見込金額
          </Text>
          <Text style={styles.colMikomiku}>{formatYen(total)}</Text>
          <Text style={styles.colNote}></Text>
        </View>

        {/* フッター */}
        <Text style={styles.footer}>
          ※見込金額は市場相場に基づく参考値です。実際の買取金額は状態確認後に決定します。
        </Text>
      </Page>
    </Document>
  );
}
